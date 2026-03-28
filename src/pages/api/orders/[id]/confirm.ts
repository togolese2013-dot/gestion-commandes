import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../../lib/auth';
import { confirmOrderAvailable, confirmOrderPickedUp, getOrderById } from '../../../../lib/orders';
import { sendOrderReadyWebhook } from '../../../../lib/webhook';

export const POST: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const id = Number(params.id);
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? 'available'; // 'available' | 'picked_up'

    const currentUser = getCurrentUser(request);
    const performedBy = currentUser?.full_name ?? '';

    // Block pickup if balance is not fully paid
    if (action === 'picked_up') {
      const existing = getOrderById(id);
      if (!existing) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
      if (Number(existing.remaining_balance) > 0) {
        return new Response(
          JSON.stringify({ error: `Solde non soldé : ${existing.remaining_balance} FCFA restant.` }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    let order;
    if (action === 'picked_up') {
      order = confirmOrderPickedUp(id, performedBy);
    } else {
      order = confirmOrderAvailable(id, performedBy);
      // await so the webhook request completes before response is sent
      if (order) {
        try {
          await sendOrderReadyWebhook(order);
        } catch (webhookErr) {
          console.error('[Webhook order_ready failed]', webhookErr);
        }
      }
    }

    if (!order) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
    return new Response(JSON.stringify(order), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[POST /api/orders/:id/confirm]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
