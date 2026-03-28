import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';
import { getDb } from '../../lib/db';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return new Response(JSON.stringify({ orders: [], clients: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb();
  const like = `%${q}%`;

  const orders = db.prepare(`
    SELECT order_number, client_name, client_phone, status, total_amount, created_at
    FROM orders
    WHERE order_number LIKE ? OR client_name LIKE ? OR client_phone LIKE ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(like, like, like);

  const clients = db.prepare(`
    SELECT id, name, phone, email
    FROM clients
    WHERE name LIKE ? OR phone LIKE ?
    ORDER BY name
    LIMIT 5
  `).all(like, like);

  return new Response(JSON.stringify({ orders, clients }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
