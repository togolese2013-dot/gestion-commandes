import type { APIRoute } from 'astro';
import { requireAuth } from '../../lib/auth';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'devis');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const POST: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const formData = await context.request.formData();
    const file = formData.get('file') as File;

    if (!file || !(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'Fichier requis' }), { status: 400 });
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name.replace(/\s+/g, '_')}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = await file.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));

    return new Response(JSON.stringify({
      success: true,
      url: `/uploads/devis/${filename}`,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erreur serveur' }), { status: 500 });
  }
};
