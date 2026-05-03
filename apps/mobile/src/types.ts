import type { InventoryItem, InventoryInsight, Product, RecipeSuggestion } from '@appfridge/shared';

export interface InventoryResponseItem extends InventoryItem {
  insight: InventoryInsight;
}

export type ProductLookupResponse = Product;
export type RecipesResponse = RecipeSuggestion[];
