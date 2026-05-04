import Database from 'better-sqlite3';
import type { InventoryItem, Product, PushRegistration } from '@appfridge/shared';

const databasePath = process.env.DATABASE_PATH || './appfridge.db';

export const db = new Database(databasePath);

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
}

export function upsertProduct(product: Product) {
  db.prepare(`
    INSERT INTO products (barcode, name, brand, category, imageUrl)
    VALUES (@barcode, @name, @brand, @category, @imageUrl)
    ON CONFLICT(barcode) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      category = excluded.category,
      imageUrl = excluded.imageUrl
  `).run({
    barcode: product.barcode,
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    imageUrl: product.imageUrl ?? null
  });
}

export function findProduct(barcode: string): Product | undefined {
  return db.prepare(`SELECT barcode, name, brand, category, imageUrl FROM products WHERE barcode = ?`).get(barcode) as Product | undefined;
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
