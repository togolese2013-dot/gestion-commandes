import type { APIRoute } from 'astro';
import { getDevisById } from '../../../../lib/devis';
import { requireAuth } from '../../../../lib/auth';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'devis');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const POST: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    }

    // Verify devis exists
    const devis = getDevisById(parseInt(id));
    if (!devis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    const formData = await context.request.formData();
    const file = formData.get('file') as File;

    if (!file || !(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'Fichier requis' }), { status: 400 });
    }

    // Generate unique filename
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save file
    const buffer = await file.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));

    const photoPath = `/uploads/devis/${filename}`;

    return new Response(JSON.stringify({
      success: true,
      photo_path: photoPath,
    }), { status: 201 });
  } catch (error: any) {
    console.error('Error uploading devis photo:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Erreur serveur',
    }), { status: 500 });
  }
};
