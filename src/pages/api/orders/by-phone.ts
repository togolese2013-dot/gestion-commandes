import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import type { Order, Product } from '../../../lib/orders';
import { getEnv } from '../../../lib/env';

/** Normalize phone: keep last 8 digits for flexible matching */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-8);
}

export const GET: APIRoute = async ({ request }) => {
  // Verify secret key
  const secret = getEnv('N8N_API_SECRET', '');
  const authHeader = request.headers.get('x-api-secret') || '';
  if (!secret || authHeader !== secret) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone') || '';

  if (!phone) {
    return new Response(JSON.stringify({ error: 'Paramètre phone requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb();
  const normalized = normalizePhone(phone);

  // Fetch all orders then filter by last 8 digits (handles any prefix format)
  const allOrders = db.prepare(
    `SELECT * FROM orders ORDER BY created_at DESC`
  ).all() as Order[];

  const matched = allOrders.filter(o =>
    normalizePhone(o.client_phone).endsWith(normalized) ||
    normalized.endsWith(normalizePhone(o.client_phone))
  );

  if (!matched.length) {
    return new Response(JSON.stringify({ found: false, orders: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Attach products for matched orders
  const ids = matched.map(o => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const products = db.prepare(
    `SELECT * FROM products WHERE order_id IN (${placeholders})`
  ).all(...ids!) as Product[];

  const productMap = new Map<number, Product[]>();
  for (const p of products) {
    const list = productMap.get(p.order_id!) ?? [];
    list.push(p);
    productMap.set(p.order_id!, list);
  }

  const ordersWithProducts = matched.map(o => ({
    ...o,
    products: productMap.get(o.id!) ?? [],
  }));

  return new Response(JSON.stringify({ found: true, orders: ordersWithProducts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
