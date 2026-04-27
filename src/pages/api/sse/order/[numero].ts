import type { APIRoute } from 'astro';
import { getOrderByNumber } from '../../../../lib/orders';
import { addOrderClient, removeOrderClient, createSSEId, encodeSSE, encodeHeartbeat } from '../../../../lib/sse';

export const GET: APIRoute = async ({ params }) => {
  const numero = params.numero ?? '';
  const order = getOrderByNumber(numero);

  // Return 404 stream if order doesn't exist
  if (!order) {
    return new Response('Commande introuvable', { status: 404 });
  }

  const clientId = createSSEId();
  let heartbeatInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addOrderClient(numero, clientId, controller);

      // Send current state immediately on connect
      controller.enqueue(encodeSSE('order_status', order));

      // Heartbeat every 25s to prevent proxy / Railway timeouts
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encodeHeartbeat());
        } catch {
          clearInterval(heartbeatInterval);
          removeOrderClient(numero, clientId);
        }
      }, 25_000);
    },
    cancel() {
      clearInterval(heartbeatInterval);
      removeOrderClient(numero, clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
