import Database from 'better-sqlite3';
import type { InventoryItem, Product, PushRegistration } from '@appfridge/shared';

const databasePath = process.env.DATABASE_PATH || './appfridge.db';

export const db = new Database(databasePath);

function ensureProductExtraColumns() {
  const cols = db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('taughtByUser')) {
    db.exec(`ALTER TABLE products ADD COLUMN taughtByUser INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('note')) {
    db.exec(`ALTER TABLE products ADD COLUMN note TEXT`);
  }
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      imageUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      imageUrl TEXT,
      expirationDate TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      location TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  ensureProductExtraColumns();
}

export function upsertProduct(product: Product) {
  const taught = product.taughtByUser === true ? 1 : 0;

  db.prepare(`
    INSERT INTO products (barcode, name, brand, category, imageUrl, taughtByUser, note)
    VALUES (@barcode, @name, @brand, @category, @imageUrl, @taughtByUser, @note)
    ON CONFLICT(barcode) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      category = excluded.category,
      imageUrl = excluded.imageUrl,
      taughtByUser = excluded.taughtByUser,
      note = excluded.note
  `).run({
    barcode: product.barcode,
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    imageUrl: product.imageUrl ?? null,
    taughtByUser: taught,
    note: product.note?.trim() || null
  });
}

export function findProduct(barcode: string): Product | undefined {
  const row = db
    .prepare(`SELECT barcode, name, brand, category, imageUrl, taughtByUser, note FROM products WHERE barcode = ?`)
    .get(barcode) as
    | {
        barcode: string;
        name: string;
        brand: string | null;
        category: string | null;
        imageUrl: string | null;
        taughtByUser: number | null;
        note: string | null;
      }
    | undefined;
  if (!row) {
    return undefined;
  }
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand ?? undefined,
    category: (row.category as Product['category']) ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    taughtByUser: Boolean(row.taughtByUser),
    note: row.note?.trim() || undefined
  };
}

export function listInventory(): InventoryItem[] {
  return db.prepare(`
    SELECT id, barcode, name, brand, category, imageUrl, expirationDate, quantity, location, createdAt
    FROM inventory_items
    ORDER BY expirationDate ASC, createdAt DESC
  `).all() as InventoryItem[];
}

export function insertInventoryItem(item: InventoryItem) {
  db.prepare(`
    INSERT INTO inventory_items (
      id, barcode, name, brand, category, imageUrl, expirationDate, quantity, location, createdAt
    )
    VALUES (
      @id, @barcode, @name, @brand, @category, @imageUrl, @expirationDate, @quantity, @location, @createdAt
    )
  `).run({
    id: item.id,
    barcode: item.barcode,
    name: item.name,
    brand: item.brand ?? null,
    category: item.category ?? null,
    imageUrl: item.imageUrl ?? null,
    expirationDate: item.expirationDate,
    quantity: item.quantity,
    location: item.location,
    createdAt: item.createdAt
  });
}

export function findInventoryDuplicate(params: {
  barcode: string;
  expirationDate: string;
  location: InventoryItem['location'];
}): InventoryItem | undefined {
  return db
    .prepare(
      `SELECT id, barcode, name, brand, category, imageUrl, expirationDate, quantity, location, createdAt
       FROM inventory_items
       WHERE barcode = @barcode AND expirationDate = @expirationDate AND location = @location
       ORDER BY createdAt DESC
       LIMIT 1`
    )
    .get({
      barcode: params.barcode,
      expirationDate: params.expirationDate,
      location: params.location
    }) as InventoryItem | undefined;
}

export function findInventoryItemById(id: string): InventoryItem | undefined {
  return db
    .prepare(
      `SELECT id, barcode, name, brand, category, imageUrl, expirationDate, quantity, location, createdAt
       FROM inventory_items
       WHERE id = ?`
    )
    .get(id) as InventoryItem | undefined;
}

export function updateInventoryItem(
  id: string,
  patch: Partial<Pick<InventoryItem, 'quantity' | 'location'>>
): InventoryItem | undefined {
  const current = findInventoryItemById(id);
  if (!current) {
    return undefined;
  }

  const quantity = typeof patch.quantity === 'number' ? Math.max(1, Math.round(patch.quantity)) : current.quantity;
  const location = patch.location ?? current.location;

  db.prepare(
    `UPDATE inventory_items
     SET quantity = @quantity, location = @location
     WHERE id = @id`
  ).run({
    id,
    quantity,
    location
  });

  return findInventoryItemById(id);
}

export function deleteInventoryItem(id: string) {
  db.prepare(`DELETE FROM inventory_items WHERE id = ?`).run(id);
}

export function savePushToken(registration: PushRegistration) {
  db.prepare(`
    INSERT INTO push_tokens (token, platform, createdAt)
    VALUES (@token, @platform, @createdAt)
    ON CONFLICT(token) DO UPDATE SET
      platform = excluded.platform
  `).run({
    ...registration,
    createdAt: new Date().toISOString()
  });
}

export function listPushTokens(): string[] {
  return (db.prepare(`SELECT token FROM push_tokens`).all() as Array<{ token: string }>).map((row) => row.token);
}
