/**
 * ============================================================
 * MIGRATION : Photos base64 SQLite → Cloudflare R2
 * ============================================================
 *
 * CE SCRIPT EST À EXÉCUTER UNE SEULE FOIS en production.
 *
 * PRÉREQUIS — Variables d'environnement à définir avant exécution :
 *
 *   export R2_ACCOUNT_ID="votre_account_id"
 *   export R2_ACCESS_KEY_ID="votre_access_key"
 *   export R2_SECRET_ACCESS_KEY="votre_secret_key"
 *   export R2_BUCKET_NAME="togolese-photos"
 *   export R2_PUBLIC_URL="https://pub-xxxx.r2.dev"
 *   export DB_PATH="/app/orders.db"   # chemin prod Railway
 *
 * EXÉCUTION (Railway shell ou local) :
 *   npx tsx scripts/migrate-photos-to-r2.ts
 *
 * Ce script :
 *   1. Scanne toutes les photos base64 dans inquiries + devis
 *   2. Les upload vers R2
 *   3. Remplace les base64 par les URLs dans la DB
 *   4. Exécute VACUUM pour libérer l'espace disque
 *
 * SÉCURITÉ :
 *   - Les photos déjà en URL (https://...) sont IGNORÉES
 *   - En cas d'échec d'upload, la base64 est CONSERVÉE (pas de perte)
 *   - Un dry-run est disponible : passer --dry-run en argument
 * ============================================================
 */

import Database from 'better-sqlite3';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'orders.db');

const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET        = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL    = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

// ── Validation ────────────────────────────────────────────────────────────────

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('❌ Variables R2 manquantes. Définir :');
  console.error('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
  process.exit(1);
}

if (DRY_RUN) {
  console.log('🔍 MODE DRY-RUN — aucune modification ne sera effectuée\n');
}

// ── S3 Client ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_KEY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBase64(str: unknown): str is string {
  return typeof str === 'string' && str.startsWith('data:');
}

async function uploadOne(dataUrl: string, folder: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return dataUrl;

  const mimeType = match[1];
  const data     = Buffer.from(match[2], 'base64');
  const ext      = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const key      = `${folder}/${randomBytes(16).toString('hex')}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: data,
    ContentType: mimeType,
  }));

  return `${R2_PUBLIC_URL}/${key}`;
}

async function migratePhotosArray(
  photos: string[],
  folder: string,
  stats: Stats
): Promise<{ migrated: string[]; changed: boolean }> {
  let changed = false;
  const migrated = await Promise.all(
    photos.map(async (p) => {
      if (!isBase64(p)) return p;
      stats.found++;
      if (DRY_RUN) {
        console.log(`  [dry-run] ${p.slice(0, 60)}... → R2`);
        stats.skipped++;
        return p;
      }
      try {
        const url = await uploadOne(p, folder);
        stats.uploaded++;
        changed = true;
        return url;
      } catch (err) {
        console.error(`  ❌ Upload échoué, base64 conservée :`, (err as Error).message);
        stats.failed++;
        return p;
      }
    })
  );
  return { migrated, changed };
}

interface Stats {
  found: number;
  uploaded: number;
  skipped: number;
  failed: number;
  rowsUpdated: number;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📂 Base de données : ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const stats: Stats = { found: 0, uploaded: 0, skipped: 0, failed: 0, rowsUpdated: 0 };

  // ── 1. Inquiries ────────────────────────────────────────────────────────────

  console.log('\n📋 Traitement des demandes (inquiries)...');
  const inquiries = db.prepare('SELECT id, products, photos FROM inquiries').all() as any[];
  console.log(`   ${inquiries.length} demandes à analyser`);

  for (const row of inquiries) {
    let changed = false;

    // products[].photos
    let products: any[] = [];
    try { products = JSON.parse(row.products || '[]'); } catch { continue; }

    const migratedProducts = await Promise.all(
      products.map(async (p: any) => {
        if (!Array.isArray(p.photos) || p.photos.length === 0) return p;
        const { migrated, changed: c } = await migratePhotosArray(p.photos, 'inquiries', stats);
        if (c) changed = true;
        return { ...p, photos: migrated };
      })
    );

    // global photos array
    let globalPhotos: string[] = [];
    try { globalPhotos = JSON.parse(row.photos || '[]'); } catch {}
    const { migrated: migratedGlobal, changed: gc } = await migratePhotosArray(globalPhotos, 'inquiries', stats);
    if (gc) changed = true;

    if (changed && !DRY_RUN) {
      db.prepare('UPDATE inquiries SET products = ?, photos = ? WHERE id = ?').run(
        JSON.stringify(migratedProducts),
        JSON.stringify(migratedGlobal),
        row.id
      );
      stats.rowsUpdated++;
      process.stdout.write('.');
    }
  }

  // ── 2. Devis ────────────────────────────────────────────────────────────────

  console.log('\n\n📄 Traitement des devis...');
  const devis = db.prepare('SELECT id, products_summary FROM devis').all() as any[];
  console.log(`   ${devis.length} devis à analyser`);

  for (const row of devis) {
    let products: any[] = [];
    try { products = JSON.parse(row.products_summary || '[]'); } catch { continue; }

    let changed = false;
    const migratedProducts = await Promise.all(
      products.map(async (p: any) => {
        if (!Array.isArray(p.photos) || p.photos.length === 0) return p;
        const { migrated, changed: c } = await migratePhotosArray(p.photos, 'devis', stats);
        if (c) changed = true;
        return { ...p, photos: migrated };
      })
    );

    if (changed && !DRY_RUN) {
      db.prepare('UPDATE devis SET products_summary = ? WHERE id = ?').run(
        JSON.stringify(migratedProducts),
        row.id
      );
      stats.rowsUpdated++;
      process.stdout.write('.');
    }
  }

  // ── 3. VACUUM ────────────────────────────────────────────────────────────────

  if (!DRY_RUN && stats.uploaded > 0) {
    console.log('\n\n🧹 VACUUM en cours (libération espace disque)...');
    db.exec('VACUUM');
    console.log('   ✅ VACUUM terminé');
  }

  db.close();

  // ── Rapport ──────────────────────────────────────────────────────────────────

  console.log('\n\n═══════════════════════════════════');
  console.log('  RAPPORT DE MIGRATION');
  console.log('═══════════════════════════════════');
  console.log(`  Photos base64 trouvées : ${stats.found}`);
  if (DRY_RUN) {
    console.log(`  Mode dry-run (rien modifié)`);
  } else {
    console.log(`  Uploadées vers R2      : ${stats.uploaded}`);
    console.log(`  Échecs (conservées)    : ${stats.failed}`);
    console.log(`  Lignes DB mises à jour : ${stats.rowsUpdated}`);
  }
  console.log('═══════════════════════════════════');

  if (!DRY_RUN && stats.uploaded > 0) {
    console.log('\n✅ Migration terminée. Vérifier Railway storage — devrait avoir libéré de l\'espace.');
  } else if (stats.found === 0) {
    console.log('\n✅ Aucune photo base64 trouvée — DB déjà propre.');
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
