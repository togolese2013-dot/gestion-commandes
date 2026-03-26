import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../lib/auth';
import { getPaymentsByOrderId } from '../../../../lib/orders';

export const GET: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const id = Number(params.id);
  if (!id || isNaN(id)) {
    return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
  }

  const payments = getPaymentsByOrderId(id);
  return new Response(JSON.stringify(payments), {
    headers: { 'Content-Type': 'application/json' },
  });
};
