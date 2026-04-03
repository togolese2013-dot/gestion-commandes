import { getDb } from './db';
import { getInquiryById } from './inquiries';
import crypto from 'crypto';

export interface Devis {
  id?: number;
  inquiry_id: number;
  devis_number: string;
  client_name: string;
  client_phone: string;
  products_summary: any[];
  total_amount: number;
  acompte_amount: number;
  solde_amount: number;
  delivery_type: 'avion' | 'bateau';
  estimated_delivery: string;
  validity_days: number;
  validity_until: string;
  devis_status: 'en_attente' | 'accepte' | 'refuse';
  access_token?: string;
  created_at?: string;
  updated_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
}

// Generate secure access token for client
export function generateAccessToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Generate devis number format: DEV-2026-001, DEV-2026-002, etc.
function generateDevisNumber(): string {
  const db = getDb();
  const year = new Date().getFullYear();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM devis WHERE devis_number LIKE ?`)
    .get(`DEV-${year}-%`) as { c: number }).c;
  return `DEV-${year}-${String(count + 1).padStart(3, '0')}`;
}

// Calculate delivery date based on transport type
function calculateDeliveryDate(deliveryType: 'avion' | 'bateau'): string {
  const today = new Date();
  let daysToAdd = 0;

  if (deliveryType === 'avion') {
    daysToAdd = 9; // middle of 4-14 days
  } else {
    daysToAdd = 52; // middle of 45-60 days
  }

  const deliveryDate = new Date(today.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const yyyy = deliveryDate.getFullYear();
  const mm = String(deliveryDate.getMonth() + 1).padStart(2, '0');
  const dd = String(deliveryDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Calculate validity until date (30 days from now)
function calculateValidityUntil(): string {
  const today = new Date();
  const validityDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const yyyy = validityDate.getFullYear();
  const mm = String(validityDate.getMonth() + 1).padStart(2, '0');
  const dd = String(validityDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function createDevisFromData(
  inquiryId: number,
  clientName: string,
  clientPhone: string,
  products: any[],
  totalAmount: number,
  deliveryType: 'avion' | 'bateau'
): Devis {
  const db = getDb();

  const acompteAmount = totalAmount * 0.70;
  const soldeAmount = totalAmount * 0.30;
  const validityUntil = calculateValidityUntil();
  const estimatedDelivery = calculateDeliveryDate(deliveryType);
  const devisNumber = generateDevisNumber();
  const accessToken = generateAccessToken();
  const productsSummary = JSON.stringify(products);

  // Delete + insert atomically so no race condition leaves orphans
  const run = db.transaction(() => {
    db.prepare('DELETE FROM devis WHERE inquiry_id = ?').run(inquiryId);
    const result = db.prepare(`
      INSERT INTO devis (
        inquiry_id, devis_number, client_name, client_phone,
        products_summary, total_amount, acompte_amount, solde_amount,
        delivery_type, estimated_delivery, validity_days, validity_until,
        devis_status, access_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inquiryId, devisNumber, clientName, clientPhone,
      productsSummary, totalAmount, acompteAmount, soldeAmount,
      deliveryType, estimatedDelivery, 30, validityUntil,
      'en_attente', accessToken
    );
    return result.lastInsertRowid as number;
  });

  const newId = run();
  return getDevisById(newId)!;
}

export function createDevis(inquiryId: number): Devis {
  const db = getDb();
  const inquiry = getInquiryById(inquiryId);

  if (!inquiry) {
    throw new Error('Inquiry not found');
  }

  // Calculate amounts from products
  const products = inquiry.products || [];
  let totalAmount = 0;

  products.forEach((p: any) => {
    const qty = p.quantity || 1;
    const budget = p.budget || 0;
    totalAmount += qty * budget;
  });

  return createDevisFromData(
    inquiryId,
    inquiry.client_name,
    inquiry.client_phone,
    products,
    totalAmount,
    inquiry.delivery_type || 'avion'
  );
}

export function getDevisById(id: number): Devis | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM devis WHERE id = ?').get(id) as any;
  if (!row) return null;
  return parseDevis(row);
}

export function getDevisByToken(token: string): Devis | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM devis WHERE access_token = ?').get(token) as any;
  if (!row) return null;
  return parseDevis(row);
}

export function getDevisByNumber(devisNumber: string): Devis | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM devis WHERE devis_number = ?').get(devisNumber) as any;
  if (!row) return null;
  return parseDevis(row);
}

export function getDevisByInquiry(inquiryId: number): Devis | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM devis WHERE inquiry_id = ?').get(inquiryId) as any;
  if (!row) return null;
  return parseDevis(row);
}

export function getAllDevis(): Devis[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM devis ORDER BY created_at DESC').all() as any[];
  return rows.map(parseDevis);
}

export function updateDevisStatus(
  id: number,
  status: 'accepte' | 'refuse',
  reason?: string
): Devis | null {
  const db = getDb();
  const devis = getDevisById(id);
  if (!devis) return null;

  const now = new Date().toISOString();
  let sql = `UPDATE devis SET devis_status = ?, updated_at = ?`;
  const params: any[] = [status, now];

  if (status === 'accepte') {
    sql += `, accepted_at = ?`;
    params.push(now);
  } else if (status === 'refuse') {
    sql += `, rejected_at = ?`;
    params.push(now);
    if (reason) {
      sql += `, rejection_reason = ?`;
      params.push(reason);
    }
  }

  sql += ` WHERE id = ?`;
  params.push(id);

  db.prepare(sql).run(...params);
  return getDevisById(id);
}

export function updateDevis(
  id: number,
  data: {
    products_summary?: any[];
    total_amount?: number;
    acompte_amount?: number;
    solde_amount?: number;
  }
): Devis | null {
  const db = getDb();
  const devis = getDevisById(id);
  if (!devis) return null;

  const updates: string[] = [];
  const values: any[] = [];

  if (data.products_summary !== undefined) {
    updates.push('products_summary = ?');
    values.push(JSON.stringify(data.products_summary));
  }

  if (data.total_amount !== undefined) {
    updates.push('total_amount = ?');
    values.push(data.total_amount);
  }

  if (data.acompte_amount !== undefined) {
    updates.push('acompte_amount = ?');
    values.push(data.acompte_amount);
  }

  if (data.solde_amount !== undefined) {
    updates.push('solde_amount = ?');
    values.push(data.solde_amount);
  }

  if (updates.length === 0) return devis;

  updates.push('updated_at = datetime("now")');
  values.push(id);

  db.prepare(`UPDATE devis SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getDevisById(id);
}

export function deleteDevis(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM devis WHERE id = ?').run(id);
  return result.changes > 0;
}

function parseDevis(row: any): Devis {
  return {
    ...row,
    products_summary: row.products_summary ? JSON.parse(row.products_summary) : [],
  };
}
