import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getOrderById, markOrderProductsPaid } from '../../../lib/orders';
import { sendProductsPaidWhatsApp } from '../../../lib/whatsapp';
import { broadcastToAdmins, broadcastToOrder } from '../../../lib/sse';
import { logActivity } from '../../../lib/audit';

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { order_id } = body;

  if (!order_id) {
    return new Response(JSON.stringify({ error: 'order_id requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const order = getOrderById(Number(order_id));
  if (!order) {
    return new Response(JSON.stringify({ error: 'Commande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Send WhatsApp notification
    await sendProductsPaidWhatsApp(order);

    // Mark products_paid_at in DB so the button disappears and the tracking step activates
    const updatedOrder = markOrderProductsPaid(Number(order_id));
    if (updatedOrder) {
      broadcastToAdmins('order_updated', updatedOrder);
      broadcastToOrder(updatedOrder.order_number, 'order_status', updatedOrder);
      logActivity({ action: 'order.products_paid', entity_type: 'order', entity_id: updatedOrder.id, entity_ref: updatedOrder.order_number, performed_by: '' });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[POST /api/orders/notify-paid]', err);
    return new Response(JSON.stringify({ error: 'Erreur envoi WhatsApp' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
