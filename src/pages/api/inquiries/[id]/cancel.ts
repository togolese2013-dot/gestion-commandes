import type { APIRoute } from 'astro';
import { getInquiryById, updateInquiry } from '../../../../lib/inquiries';
import { requireAuth } from '../../../../lib/auth';
import { broadcastToAdmins, broadcastBadgeUpdate } from '../../../../lib/sse';
import { logActivity } from '../../../../lib/audit';
import { sendInquiryCancelledWhatsApp } from '../../../../lib/whatsapp';

export const POST: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const id = parseInt(context.params.id || '0');
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });
    }

    const inquiry = getInquiryById(id);
    if (!inquiry) {
      return new Response(JSON.stringify({ error: 'Demande introuvable' }), { status: 404 });
    }

    if (inquiry.status === 'annulee') {
      return new Response(JSON.stringify({ error: 'Demande déjà annulée' }), { status: 400 });
    }

    const body = await context.request.json().catch(() => ({}));
    const reason: string = (body.reason || '').trim();

    // Update status to annulee
    const updated = updateInquiry(id, { status: 'annulee' });
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Erreur mise à jour' }), { status: 500 });
    }

    // Broadcast to admin dashboards
    broadcastToAdmins('inquiry_updated', updated);
    broadcastBadgeUpdate();
    logActivity({
      action: 'inquiry.cancelled',
      entity_type: 'inquiry',
      entity_id: id,
      entity_ref: inquiry.client_name,
      details: reason ? { motif: reason } : undefined,
    });

    // Send WhatsApp notification to client (fire-and-forget — don't block response)
    const inquiryRef = `DEV-${String(id).padStart(4, '0')}`;
    sendInquiryCancelledWhatsApp(
      inquiry.client_name,
      inquiry.client_phone,
      inquiryRef,
      reason
    ).catch(err => {
      console.error('[cancel inquiry] WhatsApp error:', err);
    });

    return new Response(JSON.stringify({ success: true, inquiry: updated }), { status: 200 });
  } catch (error) {
    console.error('Error cancelling inquiry:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
