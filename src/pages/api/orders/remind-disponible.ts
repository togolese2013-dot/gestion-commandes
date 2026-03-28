import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getOrderById } from '../../../lib/orders';
import { sendReminderWebhook } from '../../../lib/webhook';

const REMINDER_DELAY_DAYS = 3;

// Returns orders that have been "disponible" for 3+ days without being picked up,
// and haven't received a reminder in the last 3 days.
export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const db = getDb();
  const orders = db.prepare(`
    SELECT id, order_number, client_name, client_phone, total_amount, remaining_balance,
           updated_at, reminder_sent_at
    FROM orders
    WHERE status = 'disponible'
      AND updated_at <= datetime('now', '-${REMINDER_DELAY_DAYS} days')
      AND (reminder_sent_at IS NULL OR reminder_sent_at <= datetime('now', '-${REMINDER_DELAY_DAYS} days'))
    ORDER BY updated_at ASC
  `).all();

  return new Response(JSON.stringify({ orders, count: orders.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Sends a reminder webhook for each eligible order and updates reminder_sent_at.
export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT id FROM orders
    WHERE status = 'disponible'
      AND updated_at <= datetime('now', '-${REMINDER_DELAY_DAYS} days')
      AND (reminder_sent_at IS NULL OR reminder_sent_at <= datetime('now', '-${REMINDER_DELAY_DAYS} days'))
    ORDER BY updated_at ASC
  `).all() as { id: number }[];

  const sent: string[]   = [];
  const failed: string[] = [];
  const updateStmt = db.prepare(`UPDATE orders SET reminder_sent_at = datetime('now') WHERE id = ?`);

  for (const row of rows) {
    const order = getOrderById(row.id);
    if (!order) { failed.push(`#${row.id}`); continue; }
    try {
      await sendReminderWebhook(order);
      updateStmt.run(row.id);
      sent.push(order.order_number!);
    } catch {
      failed.push(order.order_number!);
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: rows.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
