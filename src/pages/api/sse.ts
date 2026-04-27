import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';
import { addAdminClient, removeAdminClient, createSSEId, encodeSSE, encodeHeartbeat } from '../../lib/sse';
import { getAllOrders } from '../../lib/orders';
import { getAllInquiries } from '../../lib/inquiries';
import { startScheduler } from '../../lib/scheduler';

// Start the 24h auto-backup scheduler the first time any admin connects
startScheduler();

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response('Non autorisé', { status: 401 });
  }

  const clientId = createSSEId();

  // Compute initial badge counts
  const orders     = getAllOrders();
  const inquiries  = getAllInquiries();
  const orders_pending    = orders.filter(o => o.status === 'en_attente').length;
  const inquiries_pending = inquiries.filter(i => i.status === 'en_attente').length;

  let heartbeatInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addAdminClient(clientId, controller);

      // Send initial badge state immediately on connect
      controller.enqueue(encodeSSE('badge_update', { orders_pending, inquiries_pending }));

      // Heartbeat every 25s to prevent proxy / Railway timeouts
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encodeHeartbeat());
        } catch {
          clearInterval(heartbeatInterval);
          removeAdminClient(clientId);
        }
      }, 25_000);
    },
    cancel() {
      clearInterval(heartbeatInterval);
      removeAdminClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx/Railway buffering
    },
  });
};
