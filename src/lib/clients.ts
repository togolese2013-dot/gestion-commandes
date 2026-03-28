import { getDb } from './db';

export interface Client {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  photo_url?: string;
  tags?: string; // JSON array e.g. '["VIP","Régulier"]'
  created_at?: string;
  updated_at?: string;
  // computed fields
  total_orders?: number;
  total_spent?: number;
  last_order_at?: string;
}

export function getAllClients(): Client[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.*,
      COUNT(o.id)          AS total_orders,
      COALESCE(SUM(o.total_amount), 0) AS total_spent,
      MAX(o.created_at)    AS last_order_at
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id
    GROUP BY c.id
    ORDER BY last_order_at DESC, c.created_at DESC
  `).all() as Client[];
}

export function getClientById(id: number): Client | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  const client = db.prepare(`
    SELECT
      c.*,
      COUNT(o.id)          AS total_orders,
      COALESCE(SUM(o.total_amount), 0) AS total_spent,
      MAX(o.created_at)    AS last_order_at
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(id) as Client | undefined;
  return client ?? null;
}

export function getClientByPhone(phone: string): Client | null {
  const db = getDb();
  return db.prepare(`SELECT * FROM clients WHERE phone = ?`).get(phone) as Client | null;
}

export function getClientOrders(clientId: number) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId) as any[];
}

export function createClient(data: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Client {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO clients (name, phone, email, address, notes, photo_url, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.phone,
    data.email ?? '',
    data.address ?? '',
    data.notes ?? '',
    data.photo_url ?? '',
    data.tags ?? '[]',
  );
  return getClientById(result.lastInsertRowid as number)!;
}

export function updateClient(id: number, data: Partial<Client>): Client | null {
  if (!id || isNaN(id)) return null;
  const db = getDb();
  db.prepare(`
    UPDATE clients SET
      name      = COALESCE(?, name),
      phone     = COALESCE(?, phone),
      email     = COALESCE(?, email),
      address   = COALESCE(?, address),
      notes     = COALESCE(?, notes),
      photo_url = COALESCE(?, photo_url),
      tags      = COALESCE(?, tags),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name    ?? null,
    data.phone   ?? null,
    data.email   ?? null,
    data.address ?? null,
    data.notes   ?? null,
    data.photo_url ?? null,
    data.tags    ?? null,
    id,
  );
  return getClientById(id);
}

export function deleteClient(id: number): boolean {
  if (!id || isNaN(id)) return false;
  const db = getDb();
  const result = db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
  return result.changes > 0;
}

/** Find or create a client by phone when creating an order */
export function upsertClient(name: string, phone: string): number {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM clients WHERE phone = ?`).get(phone) as { id: number } | undefined;
  if (existing) {
    db.prepare(`UPDATE clients SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, existing.id);
    return existing.id;
  }
  const result = db.prepare(`INSERT INTO clients (name, phone) VALUES (?, ?)`).run(name, phone);
  return result.lastInsertRowid as number;
}
