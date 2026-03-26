import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getOrderById, updateOrder, deleteOrder } from '../../../lib/orders';

function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return raw && !isNaN(id) && id > 0 ? id : null;
}

export const GET: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = parseId(params.id);
  if (!id) return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
  const order = getOrderById(id);
  if (!order) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
  return new Response(JSON.stringify(order), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = parseId(params.id);
  if (!id) return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });

  try {
    const body = await request.json();

    // Validate delivery_type if provided
    if (body.delivery_type && !['avion', 'bateau'].includes(body.delivery_type)) {
      return new Response(JSON.stringify({ error: 'Type de livraison invalide' }), { status: 400 });
    }

    // Validate deposit vs total
    if (body.deposit !== undefined && body.total_amount !== undefined) {
      if (Number(body.deposit) > Number(body.total_amount)) {
        return new Response(JSON.stringify({ error: "L'acompte ne peut pas dépasser le total" }), { status: 400 });
      }
      body.remaining_balance = Math.max(0, Number(body.total_amount) - Number(body.deposit));
    }

    const updated = updateOrder(id, body);
    if (!updated) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[PUT /api/orders/:id]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = parseId(params.id);
  if (!id) return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
  const deleted = deleteOrder(id);
  if (!deleted) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404 });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
