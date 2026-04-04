import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { getDevisById } from '../../../../lib/devis';
import { getInquiryById, updateInquiry } from '../../../../lib/inquiries';
import { createOrder } from '../../../../lib/orders';

export const POST: APIRoute = async (context) => {
  const redirect = requireAuth(context);
  if (redirect) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
  }

  try {
    const devis = getDevisById(parseInt(id));
    if (!devis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    if (devis.devis_status !== 'accepte') {
      return new Response(JSON.stringify({ error: 'Le devis doit être accepté par le client avant conversion' }), { status: 400 });
    }

    // Mark inquiry as converted
    const inquiry = getInquiryById(devis.inquiry_id);
    if (inquiry) {
      updateInquiry(devis.inquiry_id, { status: 'convertie' });
    }

    // Convert products summary to order products format
    const products = devis.products_summary.map((p: any) => ({
      name: p.name,
      condition: p.condition || p.state || 'N/A',
      price: p.price || p.budget || p._price || 0,
      quantity: p.quantity || p._qty || 1,
    }));

    // Create the order
    const order = createOrder({
      client_name: devis.client_name,
      client_phone: devis.client_phone,
      delivery_type: devis.delivery_type,
      total_amount: devis.total_amount,
      deposit: devis.acompte_amount,
      remaining_balance: devis.solde_amount,
      products,
      notes: `Converti du devis ${devis.devis_number}`,
    });

    return new Response(JSON.stringify({
      success: true,
      order_number: order.order_number,
      order,
    }), { status: 200 });
  } catch (err) {
    console.error('[POST /api/devis/[id]/convert]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
