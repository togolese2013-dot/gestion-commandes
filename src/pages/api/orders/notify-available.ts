import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getOrderById } from '../../../lib/orders';
import { sendOrderReadyWebhook } from '../../../lib/webhook';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  // Return list of disponible orders without sending anything
  const db = getDb();
  const orders = db.prepare(
    `SELECT id, order_number, client_name, client_phone, total_amount, remaining_balance
     FROM orders WHERE status = 'en_attente' ORDER BY updated_at ASC`
  ).all();
  return new Response(JSON.stringify({ orders }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  // Optional: notify only a subset of order IDs
  const ids: number[] | null = Array.isArray(body.ids) ? body.ids : null;

  const db = getDb();
  const query = ids
    ? `SELECT id FROM orders WHERE status = 'en_attente' AND id IN (${ids.map(() => '?').join(',')})`
    : `SELECT id FROM orders WHERE status = 'en_attente' ORDER BY updated_at ASC`;
  const rows = (ids ? db.prepare(query).all(...ids) : db.prepare(query).all()) as { id: number }[];

  const sent: string[]   = [];
  const failed: string[] = [];

  for (const row of rows) {
    const order = getOrderById(row.id);
    if (!order) { failed.push(`#${row.id}`); continue; }
    try {
      await sendOrderReadyWebhook(order);
      sent.push(order.order_number!);
    } catch {
      failed.push(order.order_number!);
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: rows.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
