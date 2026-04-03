import Database from 'better-sqlite3';
import path from 'path';

// Use DB_PATH env var for Railway volume, fallback to project root for local dev
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'orders.db');

// Store on globalThis so Vite HMR module reloads reuse the same connection
// instead of creating a new one (which causes SQLITE_BUSY)
const g = globalThis as any;

export function getDb(): Database.Database {
  if (!g.__appDb) {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 10000');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    initSchema(db);
    runMigrations(db);
    seedInitialUser(db);
    g.__appDb = db;
  }
  return g.__appDb;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      delivery_type TEXT NOT NULL CHECK(delivery_type IN ('avion', 'bateau')),
      total_amount REAL NOT NULL DEFAULT 0,
      deposit REAL NOT NULL DEFAULT 0,
      remaining_balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente', 'disponible', 'recupere')),
      notes TEXT DEFAULT '',
      deposit_payment_method TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      marked_available_by TEXT DEFAULT '',
      picked_up_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      condition TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT '',
      performed_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      desired_deadline TEXT DEFAULT '',
      photos TEXT DEFAULT '[]',
      external_link TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente', 'acceptee', 'refusee', 'annulee')),
      notes TEXT DEFAULT '',
      products TEXT DEFAULT '[]',
      delivery_type TEXT DEFAULT 'avion' CHECK(delivery_type IN ('avion', 'bateau')),
      deadline TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id INTEGER NOT NULL,
      devis_number TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      products_summary TEXT NOT NULL DEFAULT '[]',
      total_amount REAL NOT NULL DEFAULT 0,
      acompte_amount REAL NOT NULL DEFAULT 0,
      solde_amount REAL NOT NULL DEFAULT 0,
      delivery_type TEXT NOT NULL CHECK(delivery_type IN ('avion', 'bateau')),
      estimated_delivery TEXT NOT NULL,
      validity_days INTEGER NOT NULL DEFAULT 30,
      validity_until TEXT NOT NULL,
      devis_status TEXT NOT NULL DEFAULT 'en_attente' CHECK(devis_status IN ('en_attente', 'accepte', 'refuse')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      accepted_at TEXT DEFAULT NULL,
      rejected_at TEXT DEFAULT NULL,
      rejection_reason TEXT DEFAULT NULL,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_products_order_id ON products(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
    CREATE INDEX IF NOT EXISTS idx_inquiries_phone ON inquiries(client_phone);
    CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
    CREATE INDEX IF NOT EXISTS idx_devis_inquiry_id ON devis(inquiry_id);
    CREATE INDEX IF NOT EXISTS idx_devis_devis_number ON devis(devis_number);
    CREATE INDEX IF NOT EXISTS idx_devis_status ON devis(devis_status);
  `);
}

// Add new columns to existing DB without losing data
function runMigrations(db: Database.Database) {
  const migrations = [
    `ALTER TABLE orders ADD COLUMN created_by TEXT DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN marked_available_by TEXT DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN picked_up_by TEXT DEFAULT ''`,
    `ALTER TABLE payments ADD COLUMN performed_by TEXT DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN deposit_payment_method TEXT DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES clients(id)`,
    // Populate clients from existing orders (one client per unique phone)
    `INSERT OR IGNORE INTO clients (name, phone, created_at)
       SELECT client_name, client_phone, MIN(created_at)
       FROM orders
       GROUP BY client_phone`,
    // Link existing orders to their client
    `UPDATE orders SET client_id = (
       SELECT id FROM clients WHERE clients.phone = orders.client_phone
     ) WHERE client_id IS NULL`,
    `ALTER TABLE clients ADD COLUMN photo_url TEXT DEFAULT ''`,
    `ALTER TABLE clients ADD COLUMN tags TEXT DEFAULT '[]'`,
    `ALTER TABLE orders ADD COLUMN reminder_sent_at TEXT DEFAULT NULL`,
    // Add new columns to inquiries for products and delivery
    `ALTER TABLE inquiries ADD COLUMN products TEXT DEFAULT '[]'`,
    `ALTER TABLE inquiries ADD COLUMN delivery_type TEXT DEFAULT 'avion'`,
    `ALTER TABLE inquiries ADD COLUMN deadline TEXT DEFAULT ''`,
    // Add access token to devis for public client access
    `ALTER TABLE devis ADD COLUMN access_token TEXT`,
    // Migrate inquiries status values: old → new
    `UPDATE inquiries SET status = 'acceptee' WHERE status IN ('contacte', 'en_cours', 'convertie')`,
    `UPDATE inquiries SET status = 'refusee' WHERE status = 'rejetee'`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists or constraint issue */ }
  }

  // Recreate inquiries table with new CHECK constraint if old one still exists
  migrateInquiriesConstraint(db);
}

function migrateInquiriesConstraint(db: Database.Database) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='inquiries'`).get() as any;
  if (!row || !row.sql.includes("'rejetee'")) return; // Already migrated

  // Run entire migration as one atomic transaction
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS inquiries_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        desired_deadline TEXT DEFAULT '',
        photos TEXT DEFAULT '[]',
        external_link TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente', 'acceptee', 'refusee', 'annulee')),
        notes TEXT DEFAULT '',
        products TEXT DEFAULT '[]',
        delivery_type TEXT DEFAULT 'avion' CHECK(delivery_type IN ('avion', 'bateau')),
        deadline TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO inquiries_v2 (id, client_name, client_phone, description, quantity,
        desired_deadline, photos, external_link, status, notes, products,
        delivery_type, deadline, created_at, updated_at)
      SELECT id, client_name, client_phone, description, quantity,
        desired_deadline, photos, external_link,
        CASE
          WHEN status IN ('contacte','en_cours','convertie') THEN 'acceptee'
          WHEN status = 'rejetee' THEN 'refusee'
          ELSE 'en_attente'
        END,
        notes, products, delivery_type, deadline, created_at, updated_at
      FROM inquiries;
      DROP TABLE inquiries;
      ALTER TABLE inquiries_v2 RENAME TO inquiries;
    `);
  });

  try {
    db.pragma('foreign_keys = OFF');
    migrate();
    db.pragma('foreign_keys = ON');
    console.log('[Migration] inquiries status constraint updated');
  } catch (e) {
    db.pragma('foreign_keys = ON');
    console.log('[Migration] inquiries already up to date');
  }
}

// Create default admin user on first launch if no users exist
// Also sync username/full_name from env vars on every start
function seedInitialUser(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';
  const full_name = process.env.INITIAL_ADMIN_NAME || 'Administrateur';

  if (count === 0) {
    db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)').run(username, password, full_name, 'admin');
    console.log(`[Auth] Compte admin créé : ${username}`);
  } else {
    // Keep the first admin in sync with env vars (including password)
    db.prepare('UPDATE users SET username = ?, full_name = ?, password = ? WHERE id = 1').run(username, full_name, password);
  }
}
