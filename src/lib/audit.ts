/**
 * Activity / audit log — records admin actions in the activity_logs table.
 * All writes are fire-and-forget (synchronous SQLite, no await needed).
 */
import { getDb } from './db';

export type EntityType = 'order' | 'inquiry' | 'devis' | 'auth' | 'backup' | 'system';

export interface ActivityLog {
  id: number;
  action: string;
  entity_type: EntityType;
  entity_id: number | null;
  entity_ref: string;
  performed_by: string;
  details: string; // JSON string
  created_at: string;
}

// Human-readable labels for known actions
export const ACTION_LABELS: Record<string, string> = {
  'order.created':          'Commande créée',
  'order.updated':          'Commande modifiée',
  'order.deleted':          'Commande supprimée',
  'order.status_available': 'Marquée disponible',
  'order.status_picked_up': 'Récupération confirmée',
  'order.payment_recorded': 'Paiement enregistré',
  'order.products_paid':    'Produits payés notifié',
  'inquiry.created':        'Demande reçue',
  'inquiry.updated':        'Demande mise à jour',
  'inquiry.deleted':        'Demande supprimée',
  'inquiry.devis_sent':     'Devis envoyé',
  'inquiry.converted':      'Convertie en commande',
  'auth.login':             'Connexion',
  'auth.login_failed':      'Tentative échouée',
  'backup.manual':          'Sauvegarde manuelle',
  'backup.auto':            'Sauvegarde automatique',
};

// Color classes per entity type
export const ENTITY_COLORS: Record<string, string> = {
  order:   'bg-blue-100 text-blue-800',
  inquiry: 'bg-amber-100 text-amber-800',
  devis:   'bg-purple-100 text-purple-800',
  auth:    'bg-green-100 text-green-800',
  backup:  'bg-gray-100 text-gray-600',
  system:  'bg-slate-100 text-slate-600',
};

// Color override for destructive actions
export const ACTION_COLORS: Record<string, string> = {
  'order.deleted':       'bg-red-100 text-red-700',
  'inquiry.deleted':     'bg-red-100 text-red-700',
  'auth.login_failed':   'bg-red-100 text-red-700',
  'order.payment_recorded': 'bg-emerald-100 text-emerald-800',
  'order.products_paid':    'bg-emerald-100 text-emerald-800',
};

/**
 * Log an activity. Silently ignores DB errors to never break the request flow.
 */
export function logActivity(params: {
  action: string;
  entity_type?: EntityType;
  entity_id?: number | null;
  entity_ref?: string;
  performed_by?: string;
  details?: Record<string, unknown>;
}): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity_logs (action, entity_type, entity_id, entity_ref, performed_by, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      params.action,
      params.entity_type ?? 'system',
      params.entity_id ?? null,
      params.entity_ref ?? '',
      params.performed_by ?? '',
      JSON.stringify(params.details ?? {}),
    );
  } catch { /* never throw — audit must not break the main flow */ }
}

/**
 * Fetch paginated activity logs with optional entity_type filter.
 */
export function getActivityLogs(opts: {
  entity_type?: string;
  limit?: number;
  offset?: number;
}): { logs: ActivityLog[]; total: number } {
  const db = getDb();
  const where = opts.entity_type && opts.entity_type !== 'all'
    ? `WHERE entity_type = '${opts.entity_type.replace(/'/g, "''")}'`
    : '';
  const limit  = opts.limit  ?? 50;
  const offset = opts.offset ?? 0;

  const logs  = db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset) as ActivityLog[];
  const total = (db.prepare(`SELECT COUNT(*) as n FROM activity_logs ${where}`).get() as { n: number }).n;
  return { logs, total };
}
