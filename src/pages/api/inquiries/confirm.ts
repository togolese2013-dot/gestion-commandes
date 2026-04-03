import type { APIRoute } from 'astro';
import { getInquiryById, updateInquiry } from '../../../lib/inquiries';
import { createDevisFromData } from '../../../lib/devis';

export const POST: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await request.json();
    const { inquiry_id, products, total, delivery_type, note } = body;

    if (!inquiry_id) {
      return new Response(
        JSON.stringify({ error: 'inquiry_id required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const inquiry = getInquiryById(inquiry_id);
    if (!inquiry) {
      return new Response(
        JSON.stringify({ error: 'Inquiry not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create devis with edited products from admin
    const devis = createDevisFromData(
      inquiry_id,
      inquiry.client_name,
      inquiry.client_phone,
      products || [],
      total || 0,
      delivery_type || 'avion'
    );

    if (!devis) {
      return new Response(
        JSON.stringify({ error: 'Failed to create devis' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update inquiry with products, delivery type, and note
    updateInquiry(inquiry_id, {
      products,
      delivery_type,
      notes: note,
      status: 'acceptee', // Mark as accepted (devis sent)
    });

    // Return devis with access token for creating client link
    return new Response(
      JSON.stringify({
        success: true,
        devis_id: devis.id,
        access_token: devis.access_token,
        devis_number: devis.devis_number,
        client_link: `/devis/c/${devis.access_token}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Error in confirm API:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
