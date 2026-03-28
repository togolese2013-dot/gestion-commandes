import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM orders WHERE status = 'en_attente'`
  ).get() as { count: number };
  return new Response(JSON.stringify({ en_attente: row.count }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
