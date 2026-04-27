import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../../../lib/auth';
import fs from 'fs';
import path from 'path';

const DB_PATH   = process.env.DB_PATH   || path.join(process.cwd(), 'orders.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');

export const GET: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const filename = params.filename ?? '';

  // Security: reject path traversal attempts
  if (!filename || filename.includes('/') || filename.includes('..') || !filename.endsWith('.db')) {
    return new Response(JSON.stringify({ error: 'Nom de fichier invalide' }), { status: 400 });
  }

  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'Fichier introuvable' }), { status: 404 });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
