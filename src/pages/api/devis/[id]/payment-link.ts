import type { APIRoute } from 'astro';
import { updatePaymentLink } from '../../../../lib/devis';
import { requireAuth } from '../../../../lib/auth';

export const POST: APIRoute = async (context) => {
  if (requireAuth(context)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  try {
    const { id } = context.params;
    if (!id) return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    const body = await context.request.json();
    const link = (body.payment_link || '').trim();
    const updated = updatePaymentLink(parseInt(id), link);
    if (!updated) return new Response(JSON.stringify({ error: 'Devis introuvable' }), { status: 404 });
    return new Response(JSON.stringify({ success: true, payment_link: updated.payment_link }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
