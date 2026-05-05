import type { InventoryItem, RecipeSuggestion } from '@appfridge/shared';
import { getInventoryInsight } from '@appfridge/shared';

const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

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

function resolveOpenAiUrl(): string {
  const raw = process.env.OPENAI_BASE_URL?.trim();
  if (!raw) {
    return DEFAULT_OPENAI_URL;
  }

  if (raw.endsWith('/chat/completions')) {
    return raw;
  }

  const base = raw.replace(/\/+$/, '');
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function resolveTimeoutMs(): number {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS || 25000);
  if (!Number.isFinite(raw)) {
    return 25000;
  }
  return Math.min(120000, Math.max(5000, Math.round(raw)));
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

function resolveAiInsight(item: InventoryItem): { daysLeft: number | null; status: string } {
  const insight = getInventoryInsight(item);

  // Для AI продукти з морозилки не вважаємо "простроченими"/"терміновими":
  // у кулінарному контексті вони мають йти як нормальні (fresh) позиції.
  if (item.location === 'freezer') {
    return {
      daysLeft: insight.daysLeft === null ? 30 : Math.max(30, insight.daysLeft),
      status: 'fresh'
    };
  }

  return {
    daysLeft: insight.daysLeft,
    status: insight.status
  };
}

function toPayload(item: InventoryItem): ProductPayload {
  const aiInsight = resolveAiInsight(item);
  return {
    name: item.name,
    quantity: item.quantity,
    location: item.location,
    category: item.category ?? null,
    expirationDate: item.location === 'freezer' ? item.originalExpirationDate ?? item.expirationDate : item.expirationDate,
    daysLeft: aiInsight.daysLeft,
    status: aiInsight.status
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

export type ParsedExpiryDate = {
  day: number;
  month: number;
  year: number;
  isoDate: string;
  confidence: number;
  rawText: string | null;
};

export type ParsedProductName = {
  name: string;
  confidence: number;
  rawText: string | null;
};

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

  return out.slice(0, 5);
}

function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1).trim();
  }

  return trimmed;
}

function shouldRetryWithoutResponseFormat(status: number, code: string, detail: string): boolean {
  if (status !== 400) {
    return false;
  }
  const hay = `${code} ${detail}`.toLowerCase();
  return hay.includes('response_format') || hay.includes('json_object') || hay.includes('unsupported');
}

type UpstreamError = {
  status: number;
  code: string;
  detail: string;
};

type UpstreamSuccess = {
  content: string;
};

type OpenAiLikeErrorPayload = {
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
};

function throwForUpstreamFailure(upstream: UpstreamError): never {
  const hay = `${upstream.code} ${upstream.detail}`.toLowerCase();
  if (upstream.status === 401 || upstream.code === 'invalid_api_key' || hay.includes('invalid api key') || hay.includes('unauthorized')) {
    throw new AiInvalidApiKeyError();
  }
  if (upstream.status === 429 || upstream.code === 'rate_limit_exceeded' || hay.includes('rate limit')) {
    throw new AiRateLimitedError();
  }
  if (upstream.status >= 500 || hay.includes('temporarily unavailable') || hay.includes('service unavailable')) {
    throw new AiServiceUnavailableError();
  }
  throw new Error(`AI_UPSTREAM_HTTP_${upstream.status}`);
}

async function requestOpenAiChat(params: {
  apiKey: string;
  model: string;
  userBody: unknown;
  includeResponseFormat: boolean;
}): Promise<UpstreamSuccess | UpstreamError> {
  const endpoint = resolveOpenAiUrl();
  const timeoutMs = resolveTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        temperature: 0.65,
        ...(params.includeResponseFormat ? { response_format: { type: 'json_object' } } : {}),
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
              '1–5 рецептів; кроки короткі; мова українська; urgency high якщо в primary_use є expired або daysLeft ≤ 3.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify(params.userBody)
          }
        ]
      })
    });

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      if (!response.ok) {
        return { status: response.status, code: '', detail: '' };
      }
      throw new Error('OpenAI returned invalid JSON payload');
    }

    const payload = rawData as OpenAiLikeErrorPayload;
    if (payload?.error && typeof payload.error === 'object') {
      const code = payload.error.code || payload.error.type || '';
      const detail = payload.error.message || '';
      return {
        status: response.ok ? 400 : response.status,
        code,
        detail
      };
    }

    if (!response.ok) {
      return { status: response.status, code: '', detail: '' };
    }

    const data = rawData as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>;
    };

    const messageContent = data.choices?.[0]?.message?.content;
    const content =
      typeof messageContent === 'string'
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent
              .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text as string)
              .join('\n')
          : null;

    if (!content || typeof content !== 'string') {
      throw new Error('OpenAI returned empty content');
    }

    return { content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiServiceUnavailableError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

  let upstream = await requestOpenAiChat({
    apiKey,
    model,
    userBody,
    includeResponseFormat: true
  });

  if ('status' in upstream && shouldRetryWithoutResponseFormat(upstream.status, upstream.code, upstream.detail)) {
    upstream = await requestOpenAiChat({
      apiKey,
      model,
      userBody,
      includeResponseFormat: false
    });
  }

  if ('status' in upstream) {
    throwForUpstreamFailure(upstream);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonString(upstream.content));
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  return normalizeRecipes(parsed);
}

async function requestOpenAiExpiryVision(params: {
  apiKey: string;
  model: string;
  imageDataUrl: string;
  includeResponseFormat: boolean;
}): Promise<UpstreamSuccess | UpstreamError> {
  const endpoint = resolveOpenAiUrl();
  const timeoutMs = resolveTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        ...(params.includeResponseFormat ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          {
            role: 'system',
            content: [
              'Ти OCR-помічник для визначення дати придатності з фото упаковки.',
              'Знайди найімовірнішу дату придатності (expiry/best before/use by).',
              'Поверни ТІЛЬКИ JSON: {"day":number|null,"month":number|null,"year":number|null,"confidence":number,"rawText":string|null}.',
              'Якщо дату не видно або сумнівно — day/month/year null, confidence <= 0.4.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Визнач дату придатності на фото.' },
              {
                type: 'image_url',
                image_url: {
                  url: params.imageDataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ]
      })
    });

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      if (!response.ok) {
        return { status: response.status, code: '', detail: '' };
      }
      throw new Error('OpenAI returned invalid JSON payload');
    }

    const payload = rawData as OpenAiLikeErrorPayload;
    if (payload?.error && typeof payload.error === 'object') {
      const code = payload.error.code || payload.error.type || '';
      const detail = payload.error.message || '';
      return {
        status: response.ok ? 400 : response.status,
        code,
        detail
      };
    }

    if (!response.ok) {
      return { status: response.status, code: '', detail: '' };
    }

    const data = rawData as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>;
    };

    const messageContent = data.choices?.[0]?.message?.content;
    const content =
      typeof messageContent === 'string'
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent
              .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text as string)
              .join('\n')
          : null;

    if (!content || typeof content !== 'string') {
      throw new Error('OpenAI returned empty content');
    }

    return { content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiServiceUnavailableError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function normalizeParsedExpiry(raw: unknown): ParsedExpiryDate | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as {
    day?: unknown;
    month?: unknown;
    year?: unknown;
    confidence?: unknown;
    rawText?: unknown;
  };

  const day = toInt(obj.day);
  const month = toInt(obj.month);
  const year = toInt(obj.year);
  if (!day || !month || !year) {
    return null;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) {
    return null;
  }

  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const confRaw = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, confRaw));
  const rawText = typeof obj.rawText === 'string' ? obj.rawText.trim() || null : null;

  return { day, month, year, isoDate, confidence, rawText };
}

export async function parseExpiryDateFromImage(imageDataUrl: string): Promise<ParsedExpiryDate> {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let upstream = await requestOpenAiExpiryVision({
    apiKey,
    model,
    imageDataUrl,
    includeResponseFormat: true
  });

  if ('status' in upstream && shouldRetryWithoutResponseFormat(upstream.status, upstream.code, upstream.detail)) {
    upstream = await requestOpenAiExpiryVision({
      apiKey,
      model,
      imageDataUrl,
      includeResponseFormat: false
    });
  }

  if ('status' in upstream) {
    throwForUpstreamFailure(upstream);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonString(upstream.content));
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const normalized = normalizeParsedExpiry(parsed);
  if (!normalized) {
    throw new Error('EXPIRY_DATE_NOT_FOUND');
  }
  return normalized;
}

async function requestOpenAiNameVision(params: {
  apiKey: string;
  model: string;
  imageDataUrl: string;
  includeResponseFormat: boolean;
}): Promise<UpstreamSuccess | UpstreamError> {
  const endpoint = resolveOpenAiUrl();
  const timeoutMs = resolveTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        ...(params.includeResponseFormat ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          {
            role: 'system',
            content: [
              'Ти OCR-помічник для визначення назви продукту з фото упаковки.',
              'Поверни ТІЛЬКИ JSON: {"name":"string|null","confidence":number,"rawText":"string|null"}.',
              'name має бути коротка нормальна назва продукту, без зайвого рекламного тексту.',
              'Якщо не впевнений або текст нечитабельний — name null, confidence <= 0.4.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Визнач назву продукту на фото упаковки.' },
              {
                type: 'image_url',
                image_url: {
                  url: params.imageDataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ]
      })
    });

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      if (!response.ok) {
        return { status: response.status, code: '', detail: '' };
      }
      throw new Error('OpenAI returned invalid JSON payload');
    }

    const payload = rawData as OpenAiLikeErrorPayload;
    if (payload?.error && typeof payload.error === 'object') {
      const code = payload.error.code || payload.error.type || '';
      const detail = payload.error.message || '';
      return {
        status: response.ok ? 400 : response.status,
        code,
        detail
      };
    }

    if (!response.ok) {
      return { status: response.status, code: '', detail: '' };
    }

    const data = rawData as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>;
    };

    const messageContent = data.choices?.[0]?.message?.content;
    const content =
      typeof messageContent === 'string'
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent
              .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text as string)
              .join('\n')
          : null;

    if (!content || typeof content !== 'string') {
      throw new Error('OpenAI returned empty content');
    }

    return { content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiServiceUnavailableError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeParsedProductName(raw: unknown): ParsedProductName | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as { name?: unknown; confidence?: unknown; rawText?: unknown };
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) {
    return null;
  }
  const confidenceRaw = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  const rawText = typeof obj.rawText === 'string' ? obj.rawText.trim() || null : null;
  return { name, confidence, rawText };
}

export async function parseProductNameFromImage(imageDataUrl: string): Promise<ParsedProductName> {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let upstream = await requestOpenAiNameVision({
    apiKey,
    model,
    imageDataUrl,
    includeResponseFormat: true
  });

  if ('status' in upstream && shouldRetryWithoutResponseFormat(upstream.status, upstream.code, upstream.detail)) {
    upstream = await requestOpenAiNameVision({
      apiKey,
      model,
      imageDataUrl,
      includeResponseFormat: false
    });
  }

  if ('status' in upstream) {
    throwForUpstreamFailure(upstream);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonString(upstream.content));
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const normalized = normalizeParsedProductName(parsed);
  if (!normalized) {
    throw new Error('PRODUCT_NAME_NOT_FOUND');
  }
  return normalized;
}
