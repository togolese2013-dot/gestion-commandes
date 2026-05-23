import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET     = process.env.R2_BUCKET_NAME;
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return new Response(JSON.stringify({ error: 'Variables R2 manquantes' }), { status: 500 });
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  });

  async function uploadOne(dataUrl: string, folder: string): Promise<string> {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return dataUrl;
    const mimeType = match[1];
    const data     = Buffer.from(match[2], 'base64');
    const ext      = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const key      = `${folder}/${randomBytes(16).toString('hex')}.${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: data, ContentType: mimeType }));
    return `${R2_PUBLIC_URL}/${key}`;
  }

  const db = getDb();
  const log: string[] = [];
  let found = 0, uploaded = 0, failed = 0, rows = 0;

  // ── Inquiries ────────────────────────────────────────────────────────────────
  const inquiries = db.prepare('SELECT id, products, photos FROM inquiries').all() as any[];
  log.push(`Demandes à analyser : ${inquiries.length}`);

  for (const row of inquiries) {
    let changed = false;
    let products: any[] = [];
    try { products = JSON.parse(row.products || '[]'); } catch { continue; }

    const migratedProducts = await Promise.all(products.map(async (p: any) => {
      if (!Array.isArray(p.photos)) return p;
      const photos = await Promise.all(p.photos.map(async (ph: string) => {
        if (!ph.startsWith('data:')) return ph;
        found++;
        try { const url = await uploadOne(ph, 'inquiries'); uploaded++; changed = true; return url; }
        catch { failed++; return ph; }
      }));
      return { ...p, photos };
    }));

    let globalPhotos: string[] = [];
    try { globalPhotos = JSON.parse(row.photos || '[]'); } catch {}
    const migratedGlobal = await Promise.all(globalPhotos.map(async (ph: string) => {
      if (!ph.startsWith('data:')) return ph;
      found++;
      try { const url = await uploadOne(ph, 'inquiries'); uploaded++; changed = true; return url; }
      catch { failed++; return ph; }
    }));

    if (changed) {
      db.prepare('UPDATE inquiries SET products = ?, photos = ? WHERE id = ?').run(
        JSON.stringify(migratedProducts), JSON.stringify(migratedGlobal), row.id
      );
      rows++;
    }
  }

  // ── Devis ─────────────────────────────────────────────────────────────────────
  const devis = db.prepare('SELECT id, products_summary FROM devis').all() as any[];
  log.push(`Devis à analyser : ${devis.length}`);

  for (const row of devis) {
    let products: any[] = [];
    try { products = JSON.parse(row.products_summary || '[]'); } catch { continue; }

    let changed = false;
    const migrated = await Promise.all(products.map(async (p: any) => {
      if (!Array.isArray(p.photos)) return p;
      const photos = await Promise.all(p.photos.map(async (ph: string) => {
        if (!ph.startsWith('data:')) return ph;
        found++;
        try { const url = await uploadOne(ph, 'devis'); uploaded++; changed = true; return url; }
        catch { failed++; return ph; }
      }));
      return { ...p, photos };
    }));

    if (changed) {
      db.prepare('UPDATE devis SET products_summary = ? WHERE id = ?').run(JSON.stringify(migrated), row.id);
      rows++;
    }
  }

  // ── VACUUM ────────────────────────────────────────────────────────────────────
  if (uploaded > 0) {
    db.exec('VACUUM');
    log.push('VACUUM exécuté');
  }

  const result = { log, found, uploaded, failed, rowsUpdated: rows };
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
