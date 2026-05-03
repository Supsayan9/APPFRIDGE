import type { Product } from '@appfridge/shared';
import { findProduct, upsertProduct } from './db.js';
import { normalizeProductCategory } from './category.js';

/** Open *Facts просять ідентифікований User-Agent: https://openfoodfacts.github.io/openfoodfacts-server/api/ */
const OPEN_FACTS_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AppFridge/1.0 (+https://github.com/; barcode lookup, low volume)'
};

const OPEN_FACTS_BASES = [
  { base: 'https://world.openfoodfacts.org', label: 'Open Food Facts' },
  { base: 'https://world.openbeautyfacts.org', label: 'Open Beauty Facts' },
  { base: 'https://world.openpetfoodfacts.org', label: 'Open Pet Food Facts' }
] as const;

const fallbackProducts: Record<string, Product> = {
  '4820000000016': {
    barcode: '4820000000016',
    name: 'Молоко',
    brand: 'Demo Farm',
    category: 'Молочні продукти',
    lookupStatus: 'fallback',
    lookupMessage: 'Товар взято з локального прикладу, а не з онлайн-каталогу.'
  },
  '5901234123457': {
    barcode: '5901234123457',
    name: 'Йогурт',
    brand: 'Fresh Cup',
    category: 'Молочні продукти',
    lookupStatus: 'fallback',
    lookupMessage: 'Товар взято з локального прикладу, а не з онлайн-каталогу.'
  },
  '5900643036792': {
    barcode: '5900643036792',
    name: 'Almette z chrzanem',
    brand: 'Almette',
    category: 'Сири',
    lookupStatus: 'fallback',
    lookupMessage: 'Категорію та назву визначено локально.'
  },
  '4823096400172': {
    barcode: '4823096400172',
    name: 'Кетчуп томатний',
    brand: 'Торчин',
    category: 'Соуси',
    lookupStatus: 'fallback',
    lookupMessage: 'Категорію та назву визначено локально.'
  },
  '4823005203559': {
    barcode: '4823005203559',
    name: 'Сир гауда',
    brand: 'Комо',
    category: 'Сири',
    lookupStatus: 'fallback',
    lookupMessage: 'Категорію та назву визначено локально.'
  }
};

/** Цифри лише; UPC-A (12) → EAN-13 з ведучим 0. */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) {
    return `0${digits}`;
  }
  return digits;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function extractNameFromOffProduct(product: Record<string, unknown>): string | null {
  const priorityKeys = [
    'product_name',
    'product_name_en',
    'product_name_uk',
    'product_name_ru',
    'product_name_pl',
    'product_name_de',
    'product_name_fr',
    'product_name_es',
    'product_name_it',
    'abbreviated_product_name',
    'generic_name',
    'generic_name_en'
  ];

  for (const key of priorityKeys) {
    const v = asTrimmedString(product[key]);
    if (v) {
      return v;
    }
  }

  for (const key of Object.keys(product)) {
    if (key.startsWith('product_name_')) {
      const v = asTrimmedString(product[key]);
      if (v) {
        return v;
      }
    }
  }

  const brands = asTrimmedString(product.brands);
  const qty = asTrimmedString(product.quantity);
  if (brands && qty) {
    return `${brands} ${qty}`;
  }
  if (brands) {
    return brands;
  }

  return null;
}

function categoryHintsFromOff(product: Record<string, unknown>): string {
  const tags = product.categories_tags;
  const tagStr = Array.isArray(tags) ? tags.join(' ') : '';
  const categories = asTrimmedString(product.categories);
  return [tagStr, categories || ''].filter(Boolean).join(' ').replace(/\b[a-z]{2}:/gi, ' ');
}

function offProductToProduct(barcode: string, product: Record<string, unknown>, catalogLabel: string): Product | null {
  const name = extractNameFromOffProduct(product);
  if (!name) {
    return null;
  }

  const brand = asTrimmedString(product.brands) ?? undefined;
  const hints = categoryHintsFromOff(product);
  const haystackName = hints ? `${name} ${hints}` : name;

  return {
    barcode,
    name,
    brand,
    category: normalizeProductCategory({
      name: haystackName,
      brand,
      category: undefined
    }),
    imageUrl:
      asTrimmedString(product.image_front_small_url) ||
      asTrimmedString(product.image_front_url) ||
      asTrimmedString(product.image_url) ||
      undefined,
    lookupStatus: 'catalog',
    lookupMessage: `Дані з ${catalogLabel}.`
  };
}

async function fetchOffCatalogProduct(
  barcode: string,
  base: string,
  label: string
): Promise<Product | null> {
  const url = `${base}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, { headers: OPEN_FACTS_HEADERS });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    status?: number;
    product?: Record<string, unknown>;
  };

  if (data.status !== 1 || !data.product || typeof data.product !== 'object') {
    return null;
  }

  return offProductToProduct(barcode, data.product, label);
}

function findCachedProduct(rawBarcode: string): Product | undefined {
  const digitsOnly = rawBarcode.replace(/\D/g, '');
  const normalized = normalizeBarcode(rawBarcode);
  const keys = new Set<string>([normalized, digitsOnly].filter(Boolean));
  if (normalized.length === 13 && normalized.startsWith('0')) {
    keys.add(normalized.slice(1));
  }
  for (const key of keys) {
    const hit = findProduct(key);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

export async function lookupProduct(rawBarcode: string): Promise<Product> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    return {
      barcode: rawBarcode.trim() || '?',
      name: 'Невідомий штрихкод',
      category: 'Інше',
      lookupStatus: 'fallback',
      lookupMessage: 'Порожній або некоректний код.'
    };
  }

  const cachedRaw = findCachedProduct(rawBarcode);
  if (cachedRaw) {
    return {
      ...cachedRaw,
      barcode,
      category: normalizeProductCategory(cachedRaw),
      lookupStatus: cachedRaw.lookupStatus || 'catalog'
    };
  }

  try {
    for (const { base, label } of OPEN_FACTS_BASES) {
      const found = await fetchOffCatalogProduct(barcode, base, label);
      if (found) {
        upsertProduct(found);
        return found;
      }
    }
  } catch {
    // Мережева помилка — нижче локальний fallback.
  }

  const fallback = fallbackProducts[barcode] || {
    barcode,
    name: `Товар ${barcode}`,
    category: normalizeProductCategory({
      name: `Товар ${barcode}`,
      brand: undefined,
      category: undefined
    }),
    lookupStatus: 'fallback' as const,
    lookupMessage:
      'Не знайдено в Open Food / Beauty / Pet Facts. Спробуйте ввести назву вручну — частина локальних або нових кодів ще не в цих базах.'
  };

  upsertProduct(fallback);
  return fallback;
}
