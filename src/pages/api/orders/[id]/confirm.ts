import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/auth';
import { confirmOrderAvailable, confirmOrderPickedUp } from '../../../../lib/orders';
import { sendOrderReadyWebhook } from '../../../../lib/webhook';

export const POST: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const id = Number(params.id);
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? 'available'; // 'available' | 'picked_up'

    let order;
    if (action === 'picked_up') {
      order = confirmOrderPickedUp(id);
    } else {
      order = confirmOrderAvailable(id);
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
