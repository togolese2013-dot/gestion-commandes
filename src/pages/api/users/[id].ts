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
  if (currentUser?.id !== id && currentUser?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403 });
  }
  const body = await request.json();
  const full_name = body.full_name?.trim() || null;
  const password  = body.password?.trim()  || null;
  const email     = body.email     !== undefined ? String(body.email).trim()     : null;
  const phone     = body.phone     !== undefined ? String(body.phone).trim()     : null;
  const birthdate = body.birthdate !== undefined ? String(body.birthdate).trim() : null;
  const avatar    = body.avatar    !== undefined ? String(body.avatar)           : null;

  const db = getDb();
  // Build dynamic SET clause
  const sets: string[] = [];
  const vals: any[]    = [];
  if (full_name !== null) { sets.push('full_name = ?'); vals.push(full_name); }
  if (password  !== null) { sets.push('password = ?');  vals.push(password); }
  if (email     !== null) { sets.push('email = ?');     vals.push(email); }
  if (phone     !== null) { sets.push('phone = ?');     vals.push(phone); }
  if (birthdate !== null) { sets.push('birthdate = ?'); vals.push(birthdate); }
  if (avatar    !== null) { sets.push('avatar = ?');    vals.push(avatar); }

  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: 'Aucune modification fournie' }), { status: 400 });
  }
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
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
