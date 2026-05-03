import type { InventoryItem, RecipeSuggestion } from './types';
import { getInventoryInsight } from './date';

function normalizeNames(items: InventoryItem[]): string[] {
  return [...new Set(items.map((item) => item.name.trim().toLowerCase()).filter(Boolean))];
}

export function buildRecipeSuggestions(items: InventoryItem[]): RecipeSuggestion[] {
  const urgent = items
    .map((item) => ({ item, insight: getInventoryInsight(item) }))
    .filter(({ insight }) => insight.status !== 'fresh')
    .sort((a, b) => a.insight.daysLeft - b.insight.daysLeft)
    .map(({ item }) => item);

  const sourceItems = urgent.length > 0 ? urgent : items.slice(0, 5);
  const ingredients = normalizeNames(sourceItems);

  if (ingredients.length === 0) {
    return [];
  }

  const hasDairy = ingredients.some((name) => ['milk', 'yogurt', 'cheese', 'кефир', 'молоко', 'йогурт', 'сыр'].some((term) => name.includes(term)));
  const hasFruit = ingredients.some((name) => ['banana', 'apple', 'orange', 'berry', 'банан', 'яблок', 'апельсин', 'ягод'].some((term) => name.includes(term)));
  const hasVegetables = ingredients.some((name) => ['tomato', 'potato', 'cucumber', 'carrot', 'pepper', 'помид', 'карто', 'огур', 'морков', 'перец'].some((term) => name.includes(term)));

  const suggestions: RecipeSuggestion[] = [
    {
      id: 'bowl',
      title: 'Rescue Bowl',
      description: 'A fast mixed bowl built around the items that expire first.',
      ingredients,
      steps: [
        'Chop the ingredients into bite-sized pieces.',
        'Warm a pan and start with the densest ingredients.',
        'Add the most urgent items next and cook until just ready.'
      ],
      urgency: urgent.length > 0 ? 'high' : 'medium'
    }
  ];

  if (hasDairy || hasFruit) {
    suggestions.push({
      id: 'smoothie',
      title: 'Smoothie or Yogurt Cup',
      description: 'Best for dairy and fruit that should be used today or tomorrow.',
      ingredients,
      steps: [
        'Blend the dairy base with fruit.',
        'Adjust sweetness or add ice if needed.',
        'Serve immediately.'
      ],
      urgency: 'high'
    });
  }

  if (hasVegetables) {
    suggestions.push({
      id: 'soup',
      title: 'Vegetable Soup',
      description: 'Reliable way to save vegetables before freshness drops.',
      ingredients,
      steps: [
        'Saute vegetables briefly.',
        'Add stock or water and simmer until tender.',
        'Blend or serve chunky.'
      ],
      urgency: urgent.length > 0 ? 'high' : 'medium'
    });
  }

  return suggestions.slice(0, 3);
}
