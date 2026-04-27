/**
 * SSE (Server-Sent Events) manager — Node.js singleton.
 * Module-level state persists across requests in Node.js standalone mode.
 */

export type SSEController = ReadableStreamDefaultController<Uint8Array>;

interface SSEClient {
  id: string;
  controller: SSEController;
}

// ── Admin clients (authenticated) ────────────────────────────────────────────
const adminClients = new Map<string, SSEClient>();
let idCounter = 0;

export function createSSEId(): string {
  return `sse_${Date.now()}_${++idCounter}`;
}

export function addAdminClient(id: string, controller: SSEController): void {
  adminClients.set(id, { id, controller });
  console.log(`[SSE] Admin connecté: ${id} (total: ${adminClients.size})`);
}

export function removeAdminClient(id: string): void {
  adminClients.delete(id);
  console.log(`[SSE] Admin déconnecté: ${id} (total: ${adminClients.size})`);
}

/** Send an SSE event to all connected admin clients. */
export function broadcastToAdmins(event: string, data: unknown): void {
  if (adminClients.size === 0) return;
  const payload = encodeSSE(event, data);
  for (const [id, client] of adminClients) {
    try {
      client.controller.enqueue(payload);
    } catch {
      // Connection dropped — clean up
      adminClients.delete(id);
      console.log(`[SSE] Admin ${id} retiré (connexion perdue)`);
    }
  }
}

// ── Order-specific clients (public tracking pages) ───────────────────────────
const orderClients = new Map<string, Map<string, SSEClient>>();

export function addOrderClient(orderNumber: string, id: string, controller: SSEController): void {
  if (!orderClients.has(orderNumber)) orderClients.set(orderNumber, new Map());
  orderClients.get(orderNumber)!.set(id, { id, controller });
}

export function removeOrderClient(orderNumber: string, id: string): void {
  orderClients.get(orderNumber)?.delete(id);
  if (orderClients.get(orderNumber)?.size === 0) orderClients.delete(orderNumber);
}

/** Send an SSE event to clients watching a specific order. */
export function broadcastToOrder(orderNumber: string, event: string, data: unknown): void {
  const clients = orderClients.get(orderNumber);
  if (!clients || clients.size === 0) return;
  const payload = encodeSSE(event, data);
  for (const [id, client] of clients) {
    try {
      client.controller.enqueue(payload);
    } catch {
      clients.delete(id);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const encoder = new TextEncoder();

export function encodeSSE(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function encodeHeartbeat(): Uint8Array {
  return encoder.encode(': heartbeat\n\n');
}
