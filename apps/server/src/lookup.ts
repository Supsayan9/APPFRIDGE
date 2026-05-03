import type { Product } from '@appfridge/shared';
import { findProduct, upsertProduct } from './db.js';

const fallbackProducts: Record<string, Product> = {
  '4820000000016': {
    barcode: '4820000000016',
    name: 'Молоко',
    brand: 'Demo Farm',
    category: 'Молочные продукты'
  },
  '5901234123457': {
    barcode: '5901234123457',
    name: 'Йогурт',
    brand: 'Fresh Cup',
    category: 'Молочные продукты'
  }
};

export async function lookupProduct(barcode: string): Promise<Product> {
  const cached = findProduct(barcode);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    if (response.ok) {
      const data = await response.json();
      const product = data.product;
      if (product?.product_name) {
        const normalized: Product = {
          barcode,
          name: product.product_name,
          brand: product.brands,
          category: product.categories_tags?.[0]?.replace('en:', '').replace(/-/g, ' '),
          imageUrl: product.image_front_small_url || product.image_front_url
        };
        upsertProduct(normalized);
        return normalized;
      }
    }
  } catch {
    // Network-dependent lookup falls back to local examples.
  }

  const fallback = fallbackProducts[barcode] || {
    barcode,
    name: `Product ${barcode}`,
    category: 'Unknown'
  };

  upsertProduct(fallback);
  return fallback;
}
