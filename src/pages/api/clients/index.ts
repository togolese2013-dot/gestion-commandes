import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getAllClients, createClient, getClientByPhone } from '../../../lib/clients';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const clients = getAllClients();
  return new Response(JSON.stringify({ clients }));
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const body = await request.json();
  const name  = body.name?.trim();
  const phone = body.phone?.trim();
  if (!name || !phone) {
    return new Response(JSON.stringify({ error: 'Nom et téléphone requis' }), { status: 400 });
  }
  const existing = getClientByPhone(phone);
  if (existing) {
    return new Response(JSON.stringify({ error: 'Un client avec ce numéro existe déjà' }), { status: 409 });
  }
  const client = createClient({ name, phone, email: body.email?.trim() ?? '', address: body.address?.trim() ?? '', notes: body.notes?.trim() ?? '' });
  return new Response(JSON.stringify({ client }), { status: 201 });
};
