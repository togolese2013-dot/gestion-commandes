import type { APIRoute } from 'astro';
import { getInquiryById, updateInquiry, deleteInquiry } from '../../../lib/inquiries';
import { requireAuth } from '../../../lib/auth';
import { broadcastToAdmins, broadcastBadgeUpdate } from '../../../lib/sse';
import { logActivity } from '../../../lib/audit';

export const GET: APIRoute = async (context) => {
  try {
    const id = parseInt(context.params.id || '0');
    const inquiry = getInquiryById(id);

    if (!inquiry) {
      return new Response(JSON.stringify({ error: 'Non trouvé' }), { status: 404 });
    }

    return new Response(JSON.stringify(inquiry), { status: 200 });
  } catch (error) {
    console.error('Error fetching inquiry:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const id = parseInt(context.params.id || '0');
    const data = await context.request.json();

    const inquiry = updateInquiry(id, data);

    if (!inquiry) {
      return new Response(JSON.stringify({ error: 'Non trouvé' }), { status: 404 });
    }

    broadcastToAdmins('inquiry_updated', inquiry);
    broadcastBadgeUpdate();
    logActivity({ action: 'inquiry.updated', entity_type: 'inquiry', entity_id: id, entity_ref: inquiry.client_name });
    return new Response(JSON.stringify(inquiry), { status: 200 });
  } catch (error) {
    console.error('Error updating inquiry:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const id = parseInt(context.params.id || '0');
    const success = deleteInquiry(id);

    if (!success) {
      return new Response(JSON.stringify({ error: 'Non trouvé' }), { status: 404 });
    }

    broadcastToAdmins('inquiry_deleted', { id });
    broadcastBadgeUpdate();
    logActivity({ action: 'inquiry.deleted', entity_type: 'inquiry', entity_id: id });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
