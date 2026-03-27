import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const db = getDb();
  const users = db.prepare('SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at ASC').all();
  return new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  try {
    const body = await request.json();
    const { username, password, full_name } = body;
    if (!username?.trim() || !password?.trim() || !full_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Tous les champs sont requis' }), { status: 400 });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existing) {
      return new Response(JSON.stringify({ error: 'Ce nom d\'utilisateur existe déjà' }), { status: 409 });
    }
    db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)').run(
      username.trim(), password.trim(), full_name.trim(), 'admin'
    );
    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (err) {
    console.error('[POST /api/users]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
