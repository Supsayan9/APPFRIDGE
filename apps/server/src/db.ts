import Database from 'better-sqlite3';
import type { InventoryItem, Product, PushRegistration } from '@appfridge/shared';

const databasePath = process.env.DATABASE_PATH || './appfridge.db';
export const FREEZER_EXPIRATION_SENTINEL = '9999-12-31';
export type ProfileOwner = 'vlad' | 'rimma';

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

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

function ensureInventoryExtraColumns() {
  const cols = db.prepare(`PRAGMA table_info(inventory_items)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('originalExpirationDate')) {
    db.exec(`ALTER TABLE inventory_items ADD COLUMN originalExpirationDate TEXT`);
  }
  if (!names.has('owner')) {
    db.exec(`ALTER TABLE inventory_items ADD COLUMN owner TEXT NOT NULL DEFAULT 'vlad'`);
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
      owner TEXT NOT NULL DEFAULT 'vlad',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  ensureProductExtraColumns();
  ensureInventoryExtraColumns();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_exp_created
    ON inventory_items(expirationDate, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_inventory_barcode_exp_location
    ON inventory_items(barcode, expirationDate, location);

    CREATE INDEX IF NOT EXISTS idx_inventory_location_exp
    ON inventory_items(location, expirationDate);

    CREATE INDEX IF NOT EXISTS idx_inventory_owner_exp_created
    ON inventory_items(owner, expirationDate, createdAt DESC);
  `);
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

export function listInventory(owner: ProfileOwner): InventoryItem[] {
  return db.prepare(`
    SELECT id, barcode, name, brand, category, imageUrl, expirationDate, originalExpirationDate, quantity, location, createdAt
    FROM inventory_items
    WHERE owner = @owner
    ORDER BY expirationDate ASC, createdAt DESC
  `).all({ owner }) as InventoryItem[];
}

export function insertInventoryItem(item: InventoryItem, owner: ProfileOwner) {
  db.prepare(`
    INSERT INTO inventory_items (
      id, barcode, name, brand, category, imageUrl, expirationDate, quantity, location, createdAt
      , originalExpirationDate, owner
    )
    VALUES (
      @id, @barcode, @name, @brand, @category, @imageUrl, @expirationDate, @quantity, @location, @createdAt, @originalExpirationDate, @owner
    )
  `).run({
    id: item.id,
    barcode: item.barcode,
    name: item.name,
    brand: item.brand ?? null,
    category: item.category ?? null,
    imageUrl: item.imageUrl ?? null,
    expirationDate: item.expirationDate,
    originalExpirationDate: item.originalExpirationDate ?? null,
    quantity: item.quantity,
    location: item.location,
    owner,
    createdAt: item.createdAt
  });
}

export function findInventoryDuplicate(params: {
  owner: ProfileOwner;
  barcode: string;
  expirationDate: string;
  originalExpirationDate?: string | null;
  location: InventoryItem['location'];
}): InventoryItem | undefined {
  if (params.location === 'freezer') {
    return db
      .prepare(
        `SELECT id, barcode, name, brand, category, imageUrl, expirationDate, originalExpirationDate, quantity, location, createdAt
         FROM inventory_items
         WHERE owner = @owner AND barcode = @barcode AND location = @location AND COALESCE(originalExpirationDate, expirationDate) = @originalExpirationDate
         ORDER BY createdAt DESC
         LIMIT 1`
      )
      .get({
        owner: params.owner,
        barcode: params.barcode,
        location: params.location,
        originalExpirationDate: params.originalExpirationDate ?? params.expirationDate
      }) as InventoryItem | undefined;
  }
  return db
    .prepare(
      `SELECT id, barcode, name, brand, category, imageUrl, expirationDate, originalExpirationDate, quantity, location, createdAt
       FROM inventory_items
       WHERE owner = @owner AND barcode = @barcode AND expirationDate = @expirationDate AND location = @location
       ORDER BY createdAt DESC
       LIMIT 1`
    )
    .get({
      owner: params.owner,
      barcode: params.barcode,
      expirationDate: params.expirationDate,
      location: params.location
    }) as InventoryItem | undefined;
}

export function findInventoryItemById(owner: ProfileOwner, id: string): InventoryItem | undefined {
  return db
    .prepare(
      `SELECT id, barcode, name, brand, category, imageUrl, expirationDate, originalExpirationDate, quantity, location, createdAt
       FROM inventory_items
       WHERE owner = @owner AND id = @id`
    )
    .get({ owner, id }) as InventoryItem | undefined;
}

export function updateInventoryItem(
  owner: ProfileOwner,
  id: string,
  patch: Partial<Pick<InventoryItem, 'quantity' | 'location'>>
): InventoryItem | undefined {
  const current = findInventoryItemById(owner, id);
  if (!current) {
    return undefined;
  }

  const quantity = typeof patch.quantity === 'number' ? Math.max(1, Math.round(patch.quantity)) : current.quantity;
  const location = patch.location ?? current.location;
  let expirationDate = current.expirationDate;
  let originalExpirationDate = current.originalExpirationDate ?? null;

  if (location !== current.location) {
    if (location === 'freezer') {
      originalExpirationDate = current.originalExpirationDate ?? current.expirationDate;
      expirationDate = FREEZER_EXPIRATION_SENTINEL;
    } else if (current.location === 'freezer') {
      expirationDate = current.originalExpirationDate ?? current.expirationDate;
      originalExpirationDate = null;
    }
  }

  db.prepare(
    `UPDATE inventory_items
     SET quantity = @quantity, location = @location, expirationDate = @expirationDate, originalExpirationDate = @originalExpirationDate
     WHERE owner = @owner AND id = @id`
  ).run({
    owner,
    id,
    quantity,
    location,
    expirationDate,
    originalExpirationDate
  });

  return findInventoryItemById(owner, id);
}

export function deleteInventoryItem(owner: ProfileOwner, id: string) {
  db.prepare(`DELETE FROM inventory_items WHERE owner = @owner AND id = @id`).run({ owner, id });
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

export function deletePushToken(token: string) {
  db.prepare(`DELETE FROM push_tokens WHERE token = ?`).run(token);
}

export function listPushTokens(): string[] {
  return (db.prepare(`SELECT token FROM push_tokens`).all() as Array<{ token: string }>).map((row) => row.token);
}
