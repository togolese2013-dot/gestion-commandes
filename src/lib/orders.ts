import { getDb } from './db';

export interface Payment {
  id?: number;
  order_id?: number;
  amount: number;
  payment_method?: string;
  created_at?: string;
}

export interface Product {
  id?: number;
  order_id?: number;
  name: string;
  condition: string;
  price: number;
  quantity: number;
}

export interface Order {
  id?: number;
  order_number?: string;
  client_name: string;
  client_phone: string;
  delivery_type: 'avion' | 'bateau';
  total_amount: number;
  deposit: number;
  remaining_balance: number;
  status?: 'en_attente' | 'disponible' | 'recupere';
  notes?: string;
  created_at?: string;
  updated_at?: string;
  products?: Product[];
}

/** Generate a unique order number: CMD-YYYYMMDD-XXXX */
function generateOrderNumber(): string {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ?`
  ).get(`CMD-${today}-%`) as { count: number };
  const seq = String(row.count + 1).padStart(4, '0');
  return `CMD-${today}-${seq}`;
}

/** Attach products to orders using a single JOIN query */
function attachProducts(orders: Order[]): Order[] {
  if (!orders.length) return orders;
  const db = getDb();
  const ids = orders.map(o => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const products = db.prepare(
    `SELECT * FROM products WHERE order_id IN (${placeholders})`
  ).all(...ids) as Product[];

  const map = new Map<number, Product[]>();
  for (const p of products) {
    const list = map.get(p.order_id!) ?? [];
    list.push(p);
    map.set(p.order_id!, list);
  }
  for (const o of orders) {
    o.products = map.get(o.id!) ?? [];
  }
  return orders;
}

export function createOrder(data: Order): Order {
  const db = getDb();
  const order_number = generateOrderNumber();
  const products = data.products ?? [];

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, client_name, client_phone, delivery_type,
      total_amount, deposit, remaining_balance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProduct = db.prepare(`
    INSERT INTO products (order_id, name, condition, price, quantity)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const result = insertOrder.run(
      order_number,
      data.client_name,
      data.client_phone,
      data.delivery_type,
      data.total_amount,
      data.deposit,
      data.remaining_balance,
      data.notes ?? ''
    );
    const orderId = result.lastInsertRowid as number;
    for (const p of products) {
      insertProduct.run(orderId, p.name, p.condition, p.price, p.quantity);
    }
    return orderId;
  });

  const orderId = transaction();
  return getOrderById(orderId)!;
}

export function getAllOrders(): Order[] {
  const db = getDb();
  const orders = db.prepare(
    `SELECT * FROM orders ORDER BY created_at DESC`
  ).all() as Order[];
  return attachProducts(orders);
}

export function getOrderById(id: number): Order | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as Order | undefined;
  if (!order) return null;
  return attachProducts([order])[0];
}

export function getOrderByNumber(orderNumber: string): Order | null {
  const db = getDb();
  const order = db.prepare(
    `SELECT * FROM orders WHERE order_number = ?`
  ).get(orderNumber) as Order | undefined;
  if (!order) return null;
  return attachProducts([order])[0];
}

export function updateOrder(id: number, data: Partial<Order>): Order | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  const products = data.products;

  const updateOrderStmt = db.prepare(`
    UPDATE orders SET
      client_name = COALESCE(?, client_name),
      client_phone = COALESCE(?, client_phone),
      delivery_type = COALESCE(?, delivery_type),
      total_amount = COALESCE(?, total_amount),
      deposit = COALESCE(?, deposit),
      remaining_balance = COALESCE(?, remaining_balance),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    updateOrderStmt.run(
      data.client_name ?? null,
      data.client_phone ?? null,
      data.delivery_type ?? null,
      data.total_amount ?? null,
      data.deposit ?? null,
      data.remaining_balance ?? null,
      data.status ?? null,
      data.notes ?? null,
      id
    );

    if (products !== undefined) {
      db.prepare(`DELETE FROM products WHERE order_id = ?`).run(id);
      const insertProduct = db.prepare(
        `INSERT INTO products (order_id, name, condition, price, quantity) VALUES (?, ?, ?, ?, ?)`
      );
      for (const p of products) {
        insertProduct.run(id, p.name, p.condition, p.price, p.quantity);
      }
    }
  });

  transaction();
  return getOrderById(id);
}

export function confirmOrderAvailable(id: number): Order | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = 'disponible', updated_at = datetime('now') WHERE id = ? AND status = 'en_attente'`
  ).run(id);
  return getOrderById(id);
}

export function confirmOrderPickedUp(id: number): Order | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = 'recupere', updated_at = datetime('now') WHERE id = ? AND status = 'disponible'`
  ).run(id);
  return getOrderById(id);
}

export interface DashboardStats {
  total: number;
  en_attente: number;
  disponible: number;
  recupere: number;
  chiffre_affaires: number;
  total_encaisse: number;
  total_impayes: number;
  express: number;
  eco: number;
  commandes_recentes: Order[];
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(status = 'en_attente') as en_attente,
      SUM(status = 'disponible') as disponible,
      SUM(status = 'recupere') as recupere,
      SUM(total_amount) as chiffre_affaires,
      SUM(deposit) as total_encaisse,
      SUM(remaining_balance) as total_impayes,
      SUM(delivery_type = 'avion') as express,
      SUM(delivery_type = 'bateau') as eco
    FROM orders
  `).get() as any;

  const recents = db.prepare(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT 5`
  ).all() as Order[];

  return {
    total: row.total ?? 0,
    en_attente: row.en_attente ?? 0,
    disponible: row.disponible ?? 0,
    recupere: row.recupere ?? 0,
    chiffre_affaires: row.chiffre_affaires ?? 0,
    total_encaisse: row.total_encaisse ?? 0,
    total_impayes: row.total_impayes ?? 0,
    express: row.express ?? 0,
    eco: row.eco ?? 0,
    commandes_recentes: attachProducts(recents),
  };
}

export function getPaymentsByOrderId(orderId: number): Payment[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM payments WHERE order_id = ? ORDER BY created_at ASC`
  ).all(orderId) as Payment[];
}

export function recordPayment(id: number, amount: number, payment_method = ''): Order | null {
  if (!id || isNaN(id) || amount <= 0) return null;
  const db = getDb();
  const order = getOrderById(id);
  if (!order) return null;
  const newDeposit = Math.min(order.deposit + amount, order.total_amount);
  const newRemaining = Math.max(0, order.total_amount - newDeposit);
  db.transaction(() => {
    db.prepare(
      `UPDATE orders SET deposit = ?, remaining_balance = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newDeposit, newRemaining, id);
    db.prepare(
      `INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)`
    ).run(id, amount, payment_method);
  })();
  return getOrderById(id);
}

export function deleteOrder(id: number): boolean {
  if (!id || isNaN(id)) return false;
  const db = getDb();
  const result = db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
  return result.changes > 0;
}
