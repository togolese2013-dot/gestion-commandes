import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM inquiries WHERE status = 'en_attente'").get() as any;
    return new Response(JSON.stringify({ en_attente: row?.count || 0 }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ en_attente: 0 }), { status: 200 });
  }
};
