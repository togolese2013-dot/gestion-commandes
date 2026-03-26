import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { getAllOrders } from '../../../lib/orders';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  const format = url.searchParams.get('format') ?? 'xlsx';
  const orders = getAllOrders();

  // Flatten rows (one row per product)
  const rows: Record<string, unknown>[] = [];
  for (const order of orders) {
    const products = order.products ?? [];
    if (products.length === 0) {
      rows.push(buildRow(order, null));
    } else {
      products.forEach((p, i) => {
        rows.push(buildRow(order, p, i > 0));
      });
    }
  }

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="commandes-${today()}.csv"`,
      },
    });
  }

  // Default: xlsx
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 12 },
    { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="commandes-${today()}.xlsx"`,
    },
  });
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildRow(order: any, product: any, continuation = false) {
  return {
    'N° Commande':       continuation ? '' : order.order_number,
    'Client':            continuation ? '' : order.client_name,
    'WhatsApp':          continuation ? '' : order.client_phone,
    'Livraison':         continuation ? '' : (order.delivery_type === 'avion' ? 'EXPRESS' : 'ECO'),
    'Produit':           product ? product.name : '',
    'État':              product ? product.condition : '',
    'Prix unit. (FCFA)': product ? product.price : '',
    'Qté':               product ? product.quantity : '',
    'Sous-total (FCFA)': product ? product.price * product.quantity : '',
    'Total (FCFA)':      continuation ? '' : order.total_amount,
    'Acompte (FCFA)':    continuation ? '' : order.deposit,
    'Reste (FCFA)':      continuation ? '' : order.remaining_balance,
    'Statut':            continuation ? '' : ({ en_attente: 'En attente', disponible: 'Disponible', recupere: 'Récupéré' }[order.status as string] ?? order.status),
    'Date':              continuation ? '' : new Date(order.created_at).toLocaleDateString('fr-FR'),
  };
}
