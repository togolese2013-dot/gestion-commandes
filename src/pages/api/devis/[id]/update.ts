import type { APIRoute } from 'astro';
import { getDevisById, updateDevis } from '../../../../lib/devis';
import { requireAuth } from '../../../../lib/auth';

export const PUT: APIRoute = async (context) => {
  try {
    const redirect = requireAuth(context);
    if (redirect) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    }

    const body = await context.request.json();
    const { products_summary, total_amount, acompte_amount, solde_amount } = body;

    // Validation
    if (!products_summary || !Array.isArray(products_summary)) {
      return new Response(JSON.stringify({ error: 'Produits requis' }), { status: 400 });
    }

    if (products_summary.length === 0) {
      return new Response(JSON.stringify({ error: 'Au moins un produit requis' }), { status: 400 });
    }

    // Validate each product
    for (const product of products_summary) {
      if (!product.name || !product.condition) {
        return new Response(JSON.stringify({ error: 'Chaque produit doit avoir un nom et une condition' }), { status: 400 });
      }
      if ((product.budget || 0) < 0 || (product.quantity || 1) < 1) {
        return new Response(JSON.stringify({ error: 'Prix et quantité invalides' }), { status: 400 });
      }
    }

    // Recalculate amounts
    let calculatedTotal = 0;
    products_summary.forEach((p: any) => {
      const qty = p.quantity || 1;
      const budget = p.budget || 0;
      calculatedTotal += qty * budget;
    });

    const calculatedAcompte = calculatedTotal * 0.70;
    const calculatedSolde = calculatedTotal * 0.30;

    // Update devis
    const updatedDevis = updateDevis(parseInt(id), {
      products_summary,
      total_amount: calculatedTotal,
      acompte_amount: calculatedAcompte,
      solde_amount: calculatedSolde,
    });

    if (!updatedDevis) {
      return new Response(JSON.stringify({ error: 'Devis non trouvé' }), { status: 404 });
    }

    return new Response(JSON.stringify({
      success: true,
      devis: updatedDevis,
    }), { status: 200 });
  } catch (error: any) {
    console.error('Error updating devis:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Erreur serveur',
    }), { status: 500 });
  }
};
