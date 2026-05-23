import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import fs from 'fs';
import path from 'path';

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'orders.db');
  const DATA_DIR = path.dirname(DB_PATH);
  const report: any = { DB_PATH, steps: [] };

  // ── 1. Tailles avant ───────────────────────────────────────────────────────
  function getFileSizeMB(p: string): string {
    try {
      const bytes = fs.statSync(p).size;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } catch { return 'absent'; }
  }

  report.before = {
    db:     getFileSizeMB(DB_PATH),
    wal:    getFileSizeMB(DB_PATH + '-wal'),
    shm:    getFileSizeMB(DB_PATH + '-shm'),
  };

  // Lister tout le contenu du répertoire data
  try {
    const files = fs.readdirSync(DATA_DIR);
    report.data_dir_contents = files.map(f => ({
      name: f,
      size: getFileSizeMB(path.join(DATA_DIR, f)),
    }));
  } catch (e) {
    report.data_dir_contents = `Erreur: ${e}`;
  }

  const db = getDb();

  // ── 2. WAL checkpoint TRUNCATE ─────────────────────────────────────────────
  try {
    const ckpt = db.pragma('wal_checkpoint(TRUNCATE)') as any[];
    report.steps.push({ step: 'wal_checkpoint(TRUNCATE)', result: ckpt });
  } catch (e) {
    report.steps.push({ step: 'wal_checkpoint(TRUNCATE)', error: String(e) });
  }

  report.after_checkpoint = {
    db:  getFileSizeMB(DB_PATH),
    wal: getFileSizeMB(DB_PATH + '-wal'),
    shm: getFileSizeMB(DB_PATH + '-shm'),
  };

  // ── 3. Taille libre estimée ────────────────────────────────────────────────
  try {
    const pageSize  = (db.pragma('page_size') as any[])[0].page_size as number;
    const freePages = (db.pragma('freelist_count') as any[])[0].freelist_count as number;
    const totalPages = (db.pragma('page_count') as any[])[0].page_count as number;
    const freeMB = (freePages * pageSize / 1024 / 1024).toFixed(2);
    const totalMB = (totalPages * pageSize / 1024 / 1024).toFixed(2);
    report.sqlite_pages = { totalMB, freeMB, freePages, totalPages };
  } catch (e) {
    report.sqlite_pages = String(e);
  }

  // ── 4. Tenter VACUUM si WAL a libéré de l'espace ──────────────────────────
  try {
    const walSize = fs.existsSync(DB_PATH + '-wal') ? fs.statSync(DB_PATH + '-wal').size : 0;
    if (walSize === 0) {
      // WAL vidé — tenter VACUUM
      db.exec('VACUUM');
      report.steps.push({ step: 'VACUUM', result: 'OK' });
    } else {
      report.steps.push({ step: 'VACUUM', result: 'Skipped — WAL non vide, risque manque espace' });
    }
  } catch (e) {
    report.steps.push({ step: 'VACUUM', error: String(e) });
  }

  report.after_vacuum = {
    db:  getFileSizeMB(DB_PATH),
    wal: getFileSizeMB(DB_PATH + '-wal'),
    shm: getFileSizeMB(DB_PATH + '-shm'),
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
