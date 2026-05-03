import type { InventoryItem, RecipeSuggestion } from '@appfridge/shared';
import { getInventoryInsight } from '@appfridge/shared';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

type ProductPayload = {
  name: string;
  quantity: number;
  location: string;
  category: string | null;
  expirationDate: string;
  daysLeft: number | null;
  status: string;
};

function buildProductContext(items: InventoryItem[]): ProductPayload[] {
  return items
    .map((item) => {
      const insight = getInventoryInsight(item);
      return {
        name: item.name,
        quantity: item.quantity,
        location: item.location,
        category: item.category ?? null,
        expirationDate: item.expirationDate,
        daysLeft: insight.daysLeft,
        status: insight.status
      };
    })
    .sort((a, b) => {
      const al = a.daysLeft ?? 9999;
      const bl = b.daysLeft ?? 9999;
      return al - bl;
    })
    .slice(0, 14);
}

function isUrgency(value: unknown): value is RecipeSuggestion['urgency'] {
  return value === 'high' || value === 'medium';
}

function normalizeRecipes(raw: unknown): RecipeSuggestion[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const recipes = (raw as { recipes?: unknown }).recipes;
  if (!Array.isArray(recipes)) {
    return [];
  }

  const out: RecipeSuggestion[] = [];

  for (let i = 0; i < recipes.length; i += 1) {
    const entry = recipes[i];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const title = (entry as { title?: unknown }).title;
    const description = (entry as { description?: unknown }).description;
    const ingredients = (entry as { ingredients?: unknown }).ingredients;
    const steps = (entry as { steps?: unknown }).steps;
    const urgency = (entry as { urgency?: unknown }).urgency;

    if (typeof title !== 'string' || typeof description !== 'string') {
      continue;
    }

    const ingList = Array.isArray(ingredients) ? ingredients.filter((x): x is string => typeof x === 'string') : [];
    const stepList = Array.isArray(steps) ? steps.filter((x): x is string => typeof x === 'string') : [];

    out.push({
      id: `ai-${i}-${crypto.randomUUID().slice(0, 8)}`,
      title: title.trim(),
      description: description.trim(),
      ingredients: ingList.map((s) => s.trim()).filter(Boolean),
      steps: stepList.map((s) => s.trim()).filter(Boolean),
      urgency: isUrgency(urgency) ? urgency : 'high',
      source: 'ai'
    });
  }

  return out.slice(0, 4);
}

export async function generateAiRecipeSuggestions(items: InventoryItem[]): Promise<RecipeSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const products = buildProductContext(items);
  if (products.length === 0) {
    return [];
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Ти кулінарний помічник українського застосунку AppFridge.',
            'Користувач надіслав список продуктів з полями daysLeft (днів до кінця терміну) та status: fresh | expiring | expired.',
            'Пріоритет: спочатку пропонуй страви з тих, що expiring або expired; для expired зазнач у description, що зіпсовані/небезпечні продукти треба викинути й не використовувати — рецепт лише для тих позицій, які ще можна вважати придатними (наприклад сухі/консервовані), або явно скажи «не вживати».',
            'Поверни СТРОГО JSON об’єкт виду: {"recipes":[{"title":"...","description":"...","ingredients":["..."],"steps":["..."],"urgency":"high"|"medium"}]}.',
            '1–3 рецепти; кроки короткі й конкретні; інгредієнти українською; urgency high якщо є expiring/expired.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify({ products })
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI returned empty content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  return normalizeRecipes(parsed);
}
