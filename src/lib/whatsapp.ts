import { getEnv } from './env';
import type { Order } from './orders';

const MAX_RETRIES = 2;       // 2 retries after the first attempt = 3 total
const RETRY_DELAY_MS = 3000; // 3 seconds between retries

/**
 * Format phone number to E.164 without the leading '+' for WhatsApp Cloud API.
 * e.g. "+22890123456" → "22890123456"
 */
function formatPhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/\s/g, '');
}

/** Wait helper for retry delays */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 * Retries up to MAX_RETRIES times on failure.
 */
async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: object[]
): Promise<void> {
  const phoneNumberId = getEnv('WHATSAPP_PHONE_NUMBER_ID');
  const token         = getEnv('WHATSAPP_ACCESS_TOKEN');

  if (!phoneNumberId || !token) {
    console.error('[WhatsApp] Variables WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquantes');
    return;
  }

  const url     = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: formatPhone(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    console.log(`[WhatsApp] Tentative ${attempt}/${MAX_RETRIES + 1} — template "${templateName}" → ${formatPhone(to)}`);

    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        console.log(`[WhatsApp] ✅ Message envoyé (tentative ${attempt}) — ID: ${(data as any)?.messages?.[0]?.id ?? '?'}`);
        return; // Success — stop retrying
      }

      console.error(`[WhatsApp] ❌ Erreur HTTP ${res.status} (tentative ${attempt}):`, JSON.stringify(data));

    } catch (err) {
      console.error(`[WhatsApp] ❌ Erreur réseau (tentative ${attempt}):`, err);
    }

    // Wait before next attempt (skip wait after last attempt)
    if (attempt <= MAX_RETRIES) {
      console.log(`[WhatsApp] ⏳ Nouvelle tentative dans ${RETRY_DELAY_MS / 1000}s...`);
      await wait(RETRY_DELAY_MS);
    }
  }

  console.error(`[WhatsApp] 🚫 Échec après ${MAX_RETRIES + 1} tentatives — template "${templateName}" → ${formatPhone(to)}`);
}

/**
 * Notify the client that their products have been purchased.
 * Template: produits_payes
 *   Body {{1}} = client_name
 *   Body {{2}} = order_number (affiché)
 *   Body {{3}} = order_number (dans le lien https://togolese.fr/commande/{{3}})
 */
export async function sendProductsPaidWhatsApp(order: Order): Promise<void> {
  const orderNumber = order.order_number ?? '';
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: order.client_name },
        { type: 'text', text: orderNumber },
        { type: 'text', text: orderNumber }, // {{3}} = numéro dans le lien
      ],
    },
  ];

  await sendTemplate(
    order.client_phone,
    'produits_payes1',
    'fr',
    components
  );
}

/**
 * Notify the client that their order has been cancelled.
 * Template: commande_annulee
 *   Body {{1}} = client_name
 *   Body {{2}} = order_number
 *   Body {{3}} = reason (raison de l'annulation)
 */
export async function sendOrderCancelledWhatsApp(order: Order, reason = ''): Promise<void> {
  const orderNumber = order.order_number ?? '';
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: order.client_name },
        { type: 'text', text: orderNumber },
        { type: 'text', text: reason || 'Annulation par l\'équipe Togolese' },
      ],
    },
  ];

  await sendTemplate(
    order.client_phone,
    'commande_annulee',
    'fr',
    components
  );
}
