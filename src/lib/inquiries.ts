import { getDb } from './db';

export interface Inquiry {
  id?: number;
  client_name: string;
  client_phone: string;
  description: string;
  quantity?: number;
  desired_deadline?: string;
  photos?: string[]; // JSON stringified in DB
  external_link?: string;
  status?: 'en_attente' | 'acceptee' | 'refusee' | 'annulee';
  notes?: string;
  products?: any[]; // JSON stringified in DB
  delivery_type?: 'avion' | 'bateau';
  deadline?: string;
  created_at?: string;
  updated_at?: string;
}

export function createInquiry(data: Inquiry): Inquiry {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO inquiries (
      client_name, client_phone, description, quantity,
      desired_deadline, photos, external_link, status, notes,
      products, delivery_type, deadline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const photosJson = JSON.stringify(data.photos || []);
  const productsJson = JSON.stringify(data.products || []);
  const result = stmt.run(
    data.client_name,
    data.client_phone,
    data.description,
    data.quantity || 1,
    data.desired_deadline || '',
    photosJson,
    data.external_link || '',
    'en_attente',
    data.notes || '',
    productsJson,
    data.delivery_type || 'avion',
    data.deadline || ''
  );

  return getInquiryById(result.lastInsertRowid as number)!;
}

export function getInquiryById(id: number): Inquiry | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id) as any;
  if (!row) return null;
  return parseInquiry(row);
}

export function getAllInquiries(): Inquiry[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all() as any[];
  return rows.map(parseInquiry);
}

export function getInquiriesByStatus(status: string): Inquiry[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM inquiries WHERE status = ? ORDER BY created_at DESC').all(status) as any[];
  return rows.map(parseInquiry);
}

export function getInquiriesByPhone(phone: string): Inquiry[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM inquiries WHERE client_phone = ? ORDER BY created_at DESC').all(phone) as any[];
  return rows.map(parseInquiry);
}

export function updateInquiry(id: number, data: Partial<Inquiry>): Inquiry | null {
  const db = getDb();
  const inquiry = getInquiryById(id);
  if (!inquiry) return null;

  const updates: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    values.push(data.notes);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(data.quantity);
  }

  if (updates.length === 0) return inquiry;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE inquiries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getInquiryById(id);
}

export function deleteInquiry(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM inquiries WHERE id = ?').run(id);
  return result.changes > 0;
}

function parseInquiry(row: any): Inquiry {
  return {
    ...row,
    photos: row.photos ? JSON.parse(row.photos) : [],
    products: row.products ? JSON.parse(row.products) : [],
  };
}
