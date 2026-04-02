import type { APIRoute } from 'astro';
import { getDevisById, updateDevisStatus } from '../../../lib/devis';
import { getInquiryById, updateInquiry } from '../../../lib/inquiries';
import { createOrder } from '../../../lib/orders';

export const GET: APIRoute = async (context) => {
  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    }

    const devis = getDevisById(parseInt(id));
    if (!devis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    return new Response(JSON.stringify(devis), { status: 200 });
  } catch (error) {
    console.error('Error fetching devis:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    }

    const body = await context.request.json();
    const { status, reason } = body;

    if (!status) {
      return new Response(JSON.stringify({ error: 'Statut requis' }), { status: 400 });
    }

    if (!['accepte', 'refuse'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Statut invalide' }), { status: 400 });
    }

    const devis = getDevisById(parseInt(id));
    if (!devis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    // Update devis status
    const updatedDevis = updateDevisStatus(parseInt(id), status, reason);

    let order = null;

    // If devis is accepted, update inquiry status to convertie and create order
    if (status === 'accepte') {
      const inquiry = getInquiryById(devis.inquiry_id);
      if (inquiry) {
        updateInquiry(devis.inquiry_id, { status: 'convertie' });
      }

      // Convert products_summary to order products
      const products = devis.products_summary.map((p: any) => ({
        name: p.name,
        condition: p.condition || 'N/A',
        price: p.budget || 0,
        quantity: p.quantity || 1,
      }));

      // Create the order with deposit and remaining balance
      order = createOrder({
        client_name: devis.client_name,
        client_phone: devis.client_phone,
        delivery_type: devis.delivery_type,
        total_amount: devis.total_amount,
        deposit: devis.acompte_amount,
        remaining_balance: devis.solde_amount,
        products,
        notes: `Créé à partir du devis ${devis.devis_number}`,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      devis: updatedDevis,
      order: order,
    }), { status: 200 });
  } catch (error) {
    console.error('Error updating devis status:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
