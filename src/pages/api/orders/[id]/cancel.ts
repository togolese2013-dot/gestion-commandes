import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../../lib/auth';
import { cancelOrder, getOrderById } from '../../../../lib/orders';
import { sendOrderCancelledWhatsApp } from '../../../../lib/whatsapp';
import { sendOrderCancelledWebhook } from '../../../../lib/webhook';
import { broadcastToAdmins, broadcastBadgeUpdate } from '../../../../lib/sse';
import { logActivity } from '../../../../lib/audit';

export const POST: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
    }

    const existing = getOrderById(id);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
    }

    if (!['en_attente', 'disponible'].includes(existing.status ?? '')) {
      return new Response(
        JSON.stringify({ error: 'Impossible d\'annuler une commande déjà récupérée ou annulée.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason: string = body.reason ?? '';

    const currentUser = getCurrentUser(request);
    const performedBy = currentUser?.full_name ?? '';

    const order = cancelOrder(id, reason, performedBy);
    if (!order) {
      return new Response(JSON.stringify({ error: 'Échec de l\'annulation' }), { status: 500 });
    }

    // Fire-and-forget notifications
    sendOrderCancelledWhatsApp(order, reason).catch(err => console.error('[Cancel] WhatsApp:', err));
    sendOrderCancelledWebhook(order, reason).catch(err => console.error('[Cancel] Webhook:', err));

    broadcastToAdmins('order_updated', order);
    broadcastBadgeUpdate();
    logActivity({
      action: 'order.cancelled',
      entity_type: 'order',
      entity_id: id,
      entity_ref: order.order_number ?? '',
      performed_by: performedBy,
      details: { reason },
    });

    return new Response(JSON.stringify(order), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[POST /api/orders/:id/cancel]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
