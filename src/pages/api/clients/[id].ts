import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getClientById, getClientOrders, updateClient, deleteClient } from '../../../lib/clients';

export const GET: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = Number(params.id);
  const client = getClientById(id);
  if (!client) return new Response(JSON.stringify({ error: 'Client introuvable' }), { status: 404 });
  const orders = getClientOrders(id);
  return new Response(JSON.stringify({ client, orders }));
};

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = Number(params.id);
  const body = await request.json();
  const client = updateClient(id, {
    name:      body.name?.trim()      || undefined,
    phone:     body.phone?.trim()     || undefined,
    email:     body.email?.trim()     ?? undefined,
    address:   body.address?.trim()   ?? undefined,
    notes:     body.notes?.trim()     ?? undefined,
    photo_url: body.photo_url?.trim() ?? undefined,
    tags:      body.tags              ?? undefined,
  });
  if (!client) return new Response(JSON.stringify({ error: 'Client introuvable' }), { status: 404 });
  return new Response(JSON.stringify({ client }));
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = Number(params.id);
  const ok = deleteClient(id);
  if (!ok) return new Response(JSON.stringify({ error: 'Client introuvable' }), { status: 404 });
  return new Response(JSON.stringify({ success: true }));
};
