import type { APIRoute } from 'astro';
import { getAllTemplates, createTemplate, deleteTemplate } from '../../lib/devis';
import { requireAuth } from '../../lib/auth';

function authError() {
  return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
}

export const GET: APIRoute = async (context) => {
  if (requireAuth(context)) return authError();
  try {
    return new Response(JSON.stringify(getAllTemplates()), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  if (requireAuth(context)) return authError();
  try {
    const body = await context.request.json();
    const { name, delivery_type, products_summary, notes } = body;
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'Nom requis' }), { status: 400 });
    }
    if (!Array.isArray(products_summary) || products_summary.length === 0) {
      return new Response(JSON.stringify({ error: 'Au moins un produit requis' }), { status: 400 });
    }
    const tpl = createTemplate({ name: name.trim(), delivery_type: delivery_type || 'avion', products_summary, notes });
    return new Response(JSON.stringify(tpl), { status: 201 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  if (requireAuth(context)) return authError();
  try {
    const url = new URL(context.request.url);
    const id = parseInt(url.searchParams.get('id') || '');
    if (!id) return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });
    const ok = deleteTemplate(id);
    if (!ok) return new Response(JSON.stringify({ error: 'Modèle introuvable' }), { status: 404 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
