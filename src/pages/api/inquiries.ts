import type { APIRoute } from 'astro';
import { createInquiry, getAllInquiries } from '../../lib/inquiries';
import { requireAuth } from '../../lib/auth';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'inquiries');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const POST: APIRoute = async (context) => {
  try {
    const formData = await context.request.formData();

    const client_name = formData.get('client_name')?.toString();
    const client_phone = formData.get('client_phone')?.toString();
    const delivery_type = formData.get('delivery_type')?.toString() || 'avion';
    const products_str = formData.get('products')?.toString();
    const desired_deadline = formData.get('desired_deadline')?.toString() || '';

    // Validation
    if (!client_name || !client_phone) {
      return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400 });
    }

    // Parse products
    let products = [];
    if (products_str) {
      try {
        products = JSON.parse(products_str);
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Format produits invalide' }), { status: 400 });
      }
    }

    if (!products.length) {
      return new Response(JSON.stringify({ error: 'Au moins un produit requis' }), { status: 400 });
    }

    // Handle file uploads for photos
    const files = formData.getAll('photos');
    const photos: string[] = [];

    for (const file of files) {
      if (file instanceof File && file.size > 0) {
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
        const filepath = path.join(UPLOAD_DIR, filename);
        const buffer = await file.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(buffer));
        photos.push(`/uploads/inquiries/${filename}`);
      }
    }

    // Create inquiry
    const description = products.map((p: any) => p.name).join(', ');
    const inquiry = createInquiry({
      client_name,
      client_phone,
      description,
      quantity: products.length,
      desired_deadline,
      photos,
      external_link: '',
      products,
      delivery_type,
      deadline: desired_deadline,
    });

    return new Response(JSON.stringify(inquiry), { status: 201 });
  } catch (error) {
    console.error('Error creating inquiry:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};

export const GET: APIRoute = async (context) => {
  try {
    // Check authentication
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const inquiries = getAllInquiries();
    return new Response(JSON.stringify(inquiries), { status: 200 });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
