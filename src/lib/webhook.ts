import type { Order } from './orders';
import { getEnv } from './env';

export async function sendNewOrderWebhook(order: Order): Promise<void> {
  const url = getEnv('N8N_WEBHOOK_NEW_ORDER');
  if (!url || url.includes('your-n8n-instance')) return;

  const siteUrl = getEnv('PUBLIC_SITE_URL');
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'new_order',
      order_number: order.order_number,
      client_name: order.client_name,
      client_phone: order.client_phone,
      delivery_type: order.delivery_type,
      total_amount: order.total_amount,
      deposit: order.deposit,
      remaining_balance: order.remaining_balance,
      order_url: `${siteUrl}/commande/${order.order_number}`,
      products: order.products ?? [],
    }),
  }).catch(err => console.error('[Webhook new_order]', err));
}

export async function sendPaymentWebhook(order: Order, amount_paid: number, payment_method = ''): Promise<void> {
  const url = getEnv('N8N_WEBHOOK_PAYMENT');
  if (!url || url.includes('your-n8n-instance')) return;

  const siteUrl = getEnv('PUBLIC_SITE_URL');
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'payment_received',
      order_number: order.order_number,
      client_name: order.client_name,
      client_phone: order.client_phone,
      amount_paid,
      payment_method,
      total_amount: order.total_amount,
      deposit: order.deposit,
      remaining_balance: order.remaining_balance,
      order_url: `${siteUrl}/commande/${order.order_number}`,
    }),
  }).catch(err => console.error('[Webhook payment_received]', err));
}

export async function sendReminderWebhook(order: Order): Promise<void> {
  const url = getEnv('N8N_WEBHOOK_ORDER_READY');
  if (!url || url.includes('your-n8n-instance')) return;

  const siteUrl = getEnv('PUBLIC_SITE_URL');
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'order_reminder',
      order_number: order.order_number,
      client_name: order.client_name,
      client_phone: order.client_phone,
      remaining_balance: order.remaining_balance,
      order_url: `${siteUrl}/commande/${order.order_number}`,
    }),
  }).catch(err => console.error('[Webhook order_reminder]', err));
}

export async function sendOrderReadyWebhook(order: Order): Promise<void> {
  const url = getEnv('N8N_WEBHOOK_ORDER_READY');
  console.log('[Webhook order_ready] URL:', url || 'NON DEFINIE');
  if (!url) { console.error('[Webhook order_ready] Variable N8N_WEBHOOK_ORDER_READY manquante'); return; }
  if (url.includes('your-n8n-instance')) { console.error('[Webhook order_ready] URL placeholder détectée'); return; }

  const siteUrl = getEnv('PUBLIC_SITE_URL');
  const payload = {
    event: 'order_ready',
    order_number: order.order_number,
    client_name: order.client_name,
    client_phone: order.client_phone,
    remaining_balance: order.remaining_balance,
    order_url: `${siteUrl}/commande/${order.order_number}`,
  };
  console.log('[Webhook order_ready] Envoi vers:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('[Webhook order_ready] Réponse HTTP:', res.status);
  } catch (err) {
    console.error('[Webhook order_ready] Erreur fetch:', err);
  }
}
