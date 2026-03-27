import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = Number(params.id);
  if (!id || isNaN(id)) {
    return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
  }
  const currentUser = getCurrentUser(request);
  // Users can only edit themselves (unless they are admin role)
  if (currentUser?.id !== id && currentUser?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403 });
  }
  const body = await request.json();
  const full_name = body.full_name?.trim();
  const password = body.password?.trim();

  if (!full_name && !password) {
    return new Response(JSON.stringify({ error: 'Aucune modification fournie' }), { status: 400 });
  }
  const db = getDb();
  if (full_name && password) {
    db.prepare('UPDATE users SET full_name = ?, password = ? WHERE id = ?').run(full_name, password, id);
  } else if (full_name) {
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, id);
  } else {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, id);
  }
  return new Response(JSON.stringify({ success: true }));
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const id = Number(params.id);
  if (!id || isNaN(id)) {
    return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
  }
  // Prevent deleting yourself
  const currentUser = getCurrentUser(request);
  if (currentUser?.id === id) {
    return new Response(JSON.stringify({ error: 'Impossible de supprimer votre propre compte' }), { status: 400 });
  }
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (total <= 1) {
    return new Response(JSON.stringify({ error: 'Impossible de supprimer le dernier utilisateur' }), { status: 400 });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return new Response(JSON.stringify({ success: true }));
};
