import { getEnv } from './env';
import type { Order } from './orders';

/**
 * Format phone number to E.164 without the leading '+' for WhatsApp Cloud API.
 * e.g. "+22890123456" → "22890123456"
 */
function formatPhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/\s/g, '');
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
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

  console.log(`[WhatsApp] Envoi template "${templateName}" → ${formatPhone(to)}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[WhatsApp] Erreur HTTP ${res.status}:`, JSON.stringify(data));
    } else {
      console.log(`[WhatsApp] Message envoyé — ID: ${(data as any)?.messages?.[0]?.id ?? '?'}`);
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur fetch:', err);
  }
}

/**
 * Notify the client that their products have been purchased.
 * Template: produits_payes
 *   Body {{1}} = client_name
 *   Body {{2}} = order_number
 *   Button URL {{1}} = order_number
 */
export async function sendProductsPaidWhatsApp(order: Order): Promise<void> {
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: order.client_name },
        { type: 'text', text: order.order_number ?? '' },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: order.order_number ?? '' },
      ],
    },
  ];

  await sendTemplate(
    order.client_phone,
    'produits_payes',
    'fr',
    components
  );
}
