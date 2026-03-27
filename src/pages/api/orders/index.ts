import type { APIRoute } from 'astro';
import { isAuthenticated, getCurrentUser } from '../../../lib/auth';
import { createOrder, getAllOrders } from '../../../lib/orders';
import { sendNewOrderWebhook } from '../../../lib/webhook';

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const orders = getAllOrders();
  return new Response(JSON.stringify(orders), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { client_name, client_phone, delivery_type, total_amount, deposit, remaining_balance, notes, payment_method, products } = body;

    // Required fields
    if (!client_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Nom du client requis' }), { status: 400 });
    }
    if (!client_phone?.trim()) {
      return new Response(JSON.stringify({ error: 'Numéro de téléphone requis' }), { status: 400 });
    }
    if (!['avion', 'bateau'].includes(delivery_type)) {
      return new Response(JSON.stringify({ error: 'Type de livraison invalide' }), { status: 400 });
    }
    if (!products?.length) {
      return new Response(JSON.stringify({ error: 'Ajoutez au moins un produit' }), { status: 400 });
    }

    // Numeric validation
    const totalNum = Number(total_amount);
    const depositNum = Number(deposit);
    const remainingNum = Number(remaining_balance);

    if (isNaN(totalNum) || totalNum < 0) {
      return new Response(JSON.stringify({ error: 'Montant total invalide' }), { status: 400 });
    }
    if (isNaN(depositNum) || depositNum < 0) {
      return new Response(JSON.stringify({ error: 'Acompte invalide' }), { status: 400 });
    }
    if (depositNum > totalNum) {
      return new Response(JSON.stringify({ error: "L'acompte ne peut pas dépasser le total" }), { status: 400 });
    }

    // Validate products
    for (const p of products) {
      if (!p.name?.trim() || !p.condition?.trim()) {
        return new Response(JSON.stringify({ error: 'Nom et état de produit requis' }), { status: 400 });
      }
      if (isNaN(Number(p.price)) || Number(p.price) < 0) {
        return new Response(JSON.stringify({ error: 'Prix de produit invalide' }), { status: 400 });
      }
      if (!Number.isInteger(Number(p.quantity)) || Number(p.quantity) < 1) {
        return new Response(JSON.stringify({ error: 'Quantité invalide' }), { status: 400 });
      }
    }

    const currentUser = getCurrentUser(request);
    const performedBy = currentUser?.full_name ?? '';

    const order = createOrder({
      client_name: client_name.trim(),
      client_phone: client_phone.trim(),
      delivery_type,
      total_amount: totalNum,
      deposit: depositNum,
      remaining_balance: Math.max(0, totalNum - depositNum),
      notes: notes?.trim() ?? '',
      deposit_payment_method: payment_method?.trim() ?? '',
      products: products.map((p: any) => ({
        name: p.name.trim(),
        condition: p.condition.trim(),
        price: Number(p.price),
        quantity: Math.max(1, Math.floor(Number(p.quantity))),
      })),
    }, performedBy);

    sendNewOrderWebhook(order);

    return new Response(JSON.stringify(order), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
};
