import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';
import { getDb } from '../../lib/db';

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const db = getDb();

  // Optional filters
  const from  = url.searchParams.get('from');   // YYYY-MM-DD
  const to    = url.searchParams.get('to');     // YYYY-MM-DD
  const method = url.searchParams.get('method'); // payment_method filter

  let where = 'WHERE 1=1';
  const params: string[] = [];

  if (from)   { where += ` AND date(p.created_at) >= ?`; params.push(from); }
  if (to)     { where += ` AND date(p.created_at) <= ?`; params.push(to); }
  if (method) { where += ` AND p.payment_method = ?`;    params.push(method); }

  const payments = db.prepare(`
    SELECT
      p.id,
      p.amount,
      p.payment_method,
      p.performed_by,
      p.created_at,
      o.order_number,
      o.client_name,
      o.client_phone,
      o.total_amount  AS order_total,
      o.deposit       AS order_deposit,
      o.remaining_balance
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    ${where}
    ORDER BY p.created_at DESC
  `).all(...params);

  // Also include initial deposits (stored on the order itself, not in payments table)
  // We already have those in payments via recordPayment, so just sum everything.

  // Daily totals
  const dailyMap: Record<string, number> = {};
  for (const p of payments as any[]) {
    const day = (p.created_at as string).slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + (p.amount as number);
  }
  const daily = Object.entries(dailyMap)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const grandTotal = (payments as any[]).reduce((s, p) => s + p.amount, 0);

  return new Response(JSON.stringify({ payments, daily, grand_total: grandTotal }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
