/**
 * Server-side scheduler — Node.js singleton.
 * Runs a daily automatic backup of the SQLite database.
 * Started once from api/sse.ts on first admin SSE connection.
 */
import fs from 'fs';
import path from 'path';

const DB_PATH    = process.env.DB_PATH    || path.join(process.cwd(), 'orders.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 30;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let _started = false;
export let lastAutoBackupAt: string | null = null;

export function startScheduler(): void {
  if (_started) return;
  _started = true;

  console.log('[Scheduler] Started — auto-backup every 24h');

  // First backup 15s after server starts (let everything settle)
  setTimeout(runAutoBackup, 15_000);

  // Then every 24h
  setInterval(runAutoBackup, INTERVAL_MS);
}

async function runAutoBackup(): Promise<void> {
  try {
    // Dynamic imports avoid circular deps (scheduler ← db ← scheduler)
    const { getDb }      = await import('./db');
    const { logActivity } = await import('./audit');

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const now      = new Date();
    const ts       = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `auto-${ts}.db`;
    const destPath = path.join(BACKUP_DIR, filename);

    const db = getDb();
    await db.backup(destPath);

    lastAutoBackupAt = now.toISOString();

    // Prune: keep only the 30 most recent backups
    const all = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    all.slice(MAX_BACKUPS).forEach(b => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch { /* ignore */ }
    });

    logActivity({ action: 'backup.auto', entity_type: 'backup', entity_ref: filename, performed_by: 'system' });
    console.log(`[Scheduler] Auto-backup OK — ${filename}`);
  } catch (err) {
    console.error('[Scheduler] Auto-backup failed:', err);
  }
}
