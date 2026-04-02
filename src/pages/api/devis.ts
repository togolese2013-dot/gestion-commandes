import type { APIRoute } from 'astro';
import { createDevis, getAllDevis } from '../../lib/devis';
import { getInquiryById } from '../../lib/inquiries';
import { requireAuth } from '../../lib/auth';

export const POST: APIRoute = async (context) => {
  try {
    // Check authentication (admin only)
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const body = await context.request.json();
    const inquiry_id = body.inquiry_id;

    if (!inquiry_id) {
      return new Response(JSON.stringify({ error: 'inquiry_id requis' }), { status: 400 });
    }

    // Check if inquiry exists
    const inquiry = getInquiryById(inquiry_id);
    if (!inquiry) {
      return new Response(JSON.stringify({ error: 'Demande non trouvée' }), { status: 404 });
    }

    // Create devis
    const devis = createDevis(inquiry_id);

    // Generate share URL
    const shareUrl = `${context.url.origin}/devis/${devis.id}`;

    return new Response(JSON.stringify({
      success: true,
      devis,
      share_url: shareUrl,
    }), { status: 201 });
  } catch (error: any) {
    console.error('Error creating devis:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Erreur serveur',
    }), { status: 400 });
  }
};

export const GET: APIRoute = async (context) => {
  try {
    // Check authentication (admin only)
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const devis = getAllDevis();
    return new Response(JSON.stringify(devis), { status: 200 });
  } catch (error) {
    console.error('Error fetching devis:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
