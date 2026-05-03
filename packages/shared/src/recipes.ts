import type { InventoryItem, RecipeSuggestion } from './types.js';
import { getInventoryInsight } from './date.js';

function normalizeNames(items: InventoryItem[]): string[] {
  return [...new Set(items.map((item) => item.name.trim().toLowerCase()).filter(Boolean))];
}

export function buildRecipeSuggestions(items: InventoryItem[]): RecipeSuggestion[] {
  const urgent = items
    .map((item) => ({ item, insight: getInventoryInsight(item) }))
    .filter(({ insight }) => insight.status !== 'fresh')
    .sort((a, b) => (a.insight.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.insight.daysLeft ?? Number.MAX_SAFE_INTEGER))
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
      source: 'rules',
      title: 'Боул із термінових продуктів',
      description: 'Швидка страва з продуктів, у яких строк закінчується найраніше.',
      ingredients,
      steps: [
        'Наріжте інгредієнти невеликими шматочками.',
        'Розігрійте сковорідку та почніть із найщільніших інгредієнтів.',
        'Додайте найтерміновіші продукти й доведіть до готовності.'
      ],
      urgency: urgent.length > 0 ? 'high' : 'medium'
    }
  ];

  if (hasDairy || hasFruit) {
    suggestions.push({
      id: 'smoothie',
      source: 'rules',
      title: 'Смузі або йогуртовий десерт',
      description: 'Підійде для молочних продуктів і фруктів, які треба використати сьогодні або завтра.',
      ingredients,
      steps: [
        'Збийте молочну основу з фруктами у блендері.',
        'За потреби додайте лід або підсолодіть.',
        'Подавайте одразу.'
      ],
      urgency: 'high'
    });
  }

  if (hasVegetables) {
    suggestions.push({
      id: 'soup',
      source: 'rules',
      title: 'Овочевий суп',
      description: 'Надійний спосіб врятувати овочі до того, як вони втратять свіжість.',
      ingredients,
      steps: [
        'Швидко обсмажте овочі.',
        'Додайте бульйон або воду та варіть до м’якості.',
        'Збийте блендером або подавайте шматочками.'
      ],
      urgency: urgent.length > 0 ? 'high' : 'medium'
    });
  }

  return suggestions.slice(0, 3);
}
