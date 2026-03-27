import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

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
