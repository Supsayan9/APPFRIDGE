import { describe, expect, it } from 'vitest';
import { buildRecipeSuggestions } from './recipes';
import type { InventoryItem } from './types';

const items: InventoryItem[] = [
  {
    id: '1',
    barcode: '1',
    name: 'Milk',
    expirationDate: '2025-01-02',
    quantity: 1,
    location: 'fridge',
    createdAt: '2025-01-01T00:00:00.000Z'
  },
  {
    id: '2',
    barcode: '2',
    name: 'Banana',
    expirationDate: '2025-01-02',
    quantity: 2,
    location: 'fridge',
    createdAt: '2025-01-01T00:00:00.000Z'
  },
  {
    id: '3',
    barcode: '3',
    name: 'Tomato',
    expirationDate: '2025-01-02',
    quantity: 2,
    location: 'fridge',
    createdAt: '2025-01-01T00:00:00.000Z'
  }
];

describe('recipe suggestions', () => {
  it('builds multiple suggestions from urgent items', () => {
    const recipes = buildRecipeSuggestions(items);
    expect(recipes.length).toBeGreaterThan(1);
    expect(recipes.some((recipe) => recipe.title.includes('Смузі'))).toBe(true);
    expect(recipes.some((recipe) => recipe.title.includes('суп'))).toBe(true);
  });
});
