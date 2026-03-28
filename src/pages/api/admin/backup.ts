import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import fs from 'fs';
import path from 'path';

const DB_PATH  = process.env.DB_PATH  || path.join(process.cwd(), 'orders.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 30;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const fullPath = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fullPath);
      return { name: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function pruneOldBackups() {
  const backups = listBackups();
  if (backups.length > MAX_BACKUPS) {
    backups.slice(MAX_BACKUPS).forEach(b => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch { /* ignore */ }
    });
  }
}

// GET — list existing backups
export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const backups = listBackups();
  return new Response(JSON.stringify({ backups, backup_dir: BACKUP_DIR }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// POST — create a new backup using SQLite hot backup API
export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    ensureBackupDir();
    const now = new Date();
    const ts  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${ts}.db`;
    const destPath = path.join(BACKUP_DIR, filename);

    const db = getDb();
    await db.backup(destPath);

    pruneOldBackups();

    const stat = fs.statSync(destPath);
    return new Response(JSON.stringify({
      success: true,
      filename,
      size: stat.size,
      created_at: stat.mtime.toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

// DELETE — delete a specific backup by filename
export const DELETE: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const filename = body.filename as string;
  if (!filename || filename.includes('/') || filename.includes('..') || !filename.endsWith('.db')) {
    return new Response(JSON.stringify({ error: 'Nom de fichier invalide' }), { status: 400 });
  }

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'Fichier introuvable' }), { status: 404 });
  }

  fs.unlinkSync(filePath);
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
