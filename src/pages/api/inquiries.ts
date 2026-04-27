import type { APIRoute } from 'astro';
import { createInquiry, getAllInquiries } from '../../lib/inquiries';
import { requireAuth } from '../../lib/auth';
import { sendNewInquiryWebhook } from '../../lib/webhook';
import { broadcastToAdmins, broadcastBadgeUpdate } from '../../lib/sse';
import { logActivity } from '../../lib/audit';
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

    // Handle file uploads for photos - associate with products
    console.log(`[inquiries.ts] Processing photos for ${products.length} products`);

    for (let idx = 0; idx < products.length; idx++) {
      const productFiles = formData.getAll(`product_${idx}_photos`);
      const productPhotos: string[] = [];

      for (const file of productFiles) {
        if (file instanceof File && file.size > 0) {
          try {
            const buffer = await file.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const mimeType = file.type || 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${base64}`;
            productPhotos.push(dataUrl);
            console.log(`[inquiries.ts] Photo stored for product ${idx}: ${file.name} (${file.size} bytes)`);
          } catch (err) {
            console.error(`[inquiries.ts] Error processing file: ${err}`);
          }
        }
      }

      if (productPhotos.length > 0) {
        products[idx].photos = productPhotos;
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
      photos: [], // Photos are now stored in each product
      external_link: '',
      products,
      delivery_type,
      deadline: desired_deadline,
    });

    // Notify owner via WhatsApp (fire-and-forget)
    sendNewInquiryWebhook(inquiry).catch((err) => console.error('[inquiries.ts] Webhook error:', err));
    broadcastToAdmins('inquiry_new', inquiry);
    broadcastBadgeUpdate();
    logActivity({ action: 'inquiry.created', entity_type: 'inquiry', entity_id: inquiry.id, entity_ref: inquiry.client_name, performed_by: inquiry.client_name });

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
