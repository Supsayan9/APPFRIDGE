import type { InventoryItem, RecipeSuggestion } from '@appfridge/shared';
import { getInventoryInsight } from '@appfridge/shared';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Скільки днів (включно) вважаємо «термін підходить до кінця» для AI — ширше за UI-статус expiring (3 дні). */
const SOON_EXPIRY_DAYS = 7;

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI_API_KEY_NOT_CONFIGURED');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiInvalidApiKeyError extends Error {
  constructor() {
    super('AI_INVALID_API_KEY');
    this.name = 'AiInvalidApiKeyError';
  }
}

export class AiRateLimitedError extends Error {
  constructor() {
    super('AI_RATE_LIMITED');
    this.name = 'AiRateLimitedError';
  }
}

export class AiServiceUnavailableError extends Error {
  constructor() {
    super('AI_SERVICE_UNAVAILABLE');
    this.name = 'AiServiceUnavailableError';
  }
}

type ProductPayload = {
  name: string;
  quantity: number;
  location: string;
  category: string | null;
  expirationDate: string;
  daysLeft: number | null;
  status: string;
};

function toPayload(item: InventoryItem): ProductPayload {
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
}

function isSoonOrExpired(daysLeft: number | null): boolean {
  if (daysLeft === null) {
    return false;
  }
  return daysLeft < 0 || daysLeft <= SOON_EXPIRY_DAYS;
}

/**
 * primary — рецепти саме з цих позицій (прострочено або залишилось ≤ SOON_EXPIRY_DAYS днів).
 * secondary — свіжіші, лише як додаток до поєднання.
 */
function buildAiPayload(items: InventoryItem[]): {
  primary_use: ProductPayload[];
  secondary_optional: ProductPayload[];
} {
  const enriched = items.map((item) => ({ item, payload: toPayload(item) }));

  const priority = enriched
    .filter(({ payload }) => isSoonOrExpired(payload.daysLeft))
    .sort((a, b) => {
      const al = a.payload.daysLeft ?? 9999;
      const bl = b.payload.daysLeft ?? 9999;
      return al - bl;
    })
    .map(({ payload }) => payload);

  if (priority.length > 0) {
    const primaryIds = new Set(enriched.filter((e) => isSoonOrExpired(e.payload.daysLeft)).map((e) => e.item.id));
    const secondary = enriched
      .filter((e) => !primaryIds.has(e.item.id))
      .sort((a, b) => {
        const al = a.payload.daysLeft ?? 9999;
        const bl = b.payload.daysLeft ?? 9999;
        return al - bl;
      })
      .slice(0, 8)
      .map(({ payload }) => payload);

    return {
      primary_use: priority.slice(0, 14),
      secondary_optional: secondary
    };
  }

  const nearest = enriched
    .sort((a, b) => {
      const al = a.payload.daysLeft ?? 9999;
      const bl = b.payload.daysLeft ?? 9999;
      return al - bl;
    })
    .slice(0, 12)
    .map(({ payload }) => payload);

  return {
    primary_use: nearest,
    secondary_optional: []
  };
}

export function resolveOpenAiApiKey(): string | null {
  const candidates = [
    process.env.OPENAI_API_KEY,
    process.env.AI_API_KEY,
    process.env.APIFREE_KEY
  ];
  for (const raw of candidates) {
    const key = raw?.trim();
    if (key) {
      return key;
    }
  }
  return null;
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
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }

  if (items.length === 0) {
    return [];
  }

  const { primary_use, secondary_optional } = buildAiPayload(items);

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const userBody = {
    hint:
      'primary_use — продукти з найкритичнішим терміном (прострочено або залишилось не більше 7 днів). Рецепти мають в першу чергу витрачати саме їх. secondary_optional — лише як легкий допоміжний набір для поєднання, не основа страви.',
    primary_use,
    secondary_optional
  };

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
            'У JSON від користувача є primary_use (термін критичний або закінчився) та secondary_optional (свіжіше).',
            'Обов’язково: основні страви будуй навколо primary_use — назви конкретні продукти з цього списку в інгредієнтах або описі.',
            'secondary_optional використовуй обережно, невеликими порціями, лише якщо логічно доповнює смак.',
            'Для простроченого (status expired або daysLeft < 0): наголоси на безпеці — швидкопсувне викинути; рецепт лише якщо реально безпечна категорія (сухі спеції тощо), інакше явно «не вживати».',
            'Поверни СТРОГО JSON: {"recipes":[{"title":"...","description":"...","ingredients":["..."],"steps":["..."],"urgency":"high"|"medium"}]}.',
            '1–3 рецепти; кроки короткі; мова українська; urgency high якщо в primary_use є expired або daysLeft ≤ 3.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify(userBody)
        }
      ]
    })
  });

  if (!response.ok) {
    let code = '';
    try {
      const payload = (await response.json()) as { error?: { code?: string; type?: string } };
      code = payload.error?.code || payload.error?.type || '';
    } catch {
      // ignore JSON parse failures and classify by HTTP status below
    }

    if (response.status === 401 || code === 'invalid_api_key') {
      throw new AiInvalidApiKeyError();
    }
    if (response.status === 429 || code === 'rate_limit_exceeded') {
      throw new AiRateLimitedError();
    }
    if (response.status >= 500) {
      throw new AiServiceUnavailableError();
    }
    throw new Error(`AI_UPSTREAM_HTTP_${response.status}`);
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
