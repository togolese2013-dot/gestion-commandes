import type { APIRoute } from 'astro';
import { getDevisById } from '../../../lib/devis';
import { getInquiryById } from '../../../lib/inquiries';
import { sendDevisWebhook } from '../../../lib/webhook';
import { requireAuth } from '../../../lib/auth';

export const POST: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const body = await context.request.json();
    const { devis_id } = body;

    if (!devis_id) {
      return new Response(JSON.stringify({ error: 'devis_id requis' }), { status: 400 });
    }

    const devis = getDevisById(devis_id);
    if (!devis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    const inquiry = getInquiryById(devis.inquiry_id);
    if (!inquiry) {
      return new Response(JSON.stringify({ error: 'Demande non trouvée' }), { status: 404 });
    }

    // Generate share URL
    const shareUrl = `${context.url.origin}/devis/${devis.id}`;

    // Send webhook
    sendDevisWebhook(inquiry, devis.devis_number, shareUrl);

    return new Response(JSON.stringify({
      success: true,
      message: 'Devis envoyé avec succès',
    }), { status: 200 });
  } catch (error: any) {
    console.error('Error sending devis:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Erreur serveur',
    }), { status: 500 });
  }
};
