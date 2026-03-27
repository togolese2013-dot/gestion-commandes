import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../../lib/auth';
import { recordPayment } from '../../../../lib/orders';
import { sendPaymentWebhook } from '../../../../lib/webhook';

export const POST: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const id = Number(params.id);
    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const payment_method: string = body.payment_method ?? '';
    const currentUser = getCurrentUser(request);
    const performedBy = currentUser?.full_name ?? '';

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Montant invalide' }), { status: 400 });
    }

    const order = recordPayment(id, amount, payment_method, performedBy);
    if (!order) {
      return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
    }

    sendPaymentWebhook(order, amount, payment_method);

    return new Response(JSON.stringify(order), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[POST /api/orders/:id/payment]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
