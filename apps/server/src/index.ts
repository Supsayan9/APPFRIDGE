import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cron from 'node-cron';
import { buildRecipeSuggestions, getInventoryInsight, type InventoryItem, type PushRegistration } from '@appfridge/shared';
import {
  deleteInventoryItem,
  deletePushToken,
  FREEZER_EXPIRATION_SENTINEL,
  findInventoryDuplicate,
  findInventoryItemById,
  initDb,
  insertInventoryItem,
  listInventory,
  savePushToken,
  updateInventoryItem,
  upsertProduct
} from './db.js';
import {
  AiInvalidApiKeyError,
  AiNotConfiguredError,
  AiRateLimitedError,
  AiServiceUnavailableError,
  generateAiRecipeSuggestions,
  parseProductNameFromImage,
  parseExpiryDateFromImage
} from './aiRecipes.js';
import { lookupProduct, normalizeBarcode } from './lookup.js';
import { normalizeProductCategory } from './category.js';
import { getUrgentInventory, sendReminderPushes } from './reminders.js';

const app = express();
const port = Number(process.env.PORT || 4000);

initDb();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*'
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.get('/products/:barcode', async (req, res) => {
  const product = await lookupProduct(req.params.barcode);
  res.json(product);
});

app.get('/inventory', (_req, res) => {
  const items = listInventory();
  res.json(
    items.map((item) => ({
      ...item,
      insight: getInventoryInsight(item)
    }))
  );
});

app.post('/inventory', (req, res) => {
  const body = req.body as Omit<InventoryItem, 'id' | 'createdAt'>;
  const barcode = normalizeBarcode(String(body.barcode ?? ''));
  if (!barcode) {
    res.status(400).json({ error: 'invalid_barcode', message: 'Потрібен непорожній штрихкод.' });
    return;
  }
  const quantityRaw = Number(body.quantity);
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    res.status(400).json({ error: 'invalid_quantity', message: 'Кількість має бути числом більше 0.' });
    return;
  }
  const quantity = Math.max(1, Math.round(quantityRaw));
  if (body.location !== 'fridge' && body.location !== 'freezer' && body.location !== 'pantry') {
    res.status(400).json({ error: 'invalid_location', message: 'Location має бути fridge/freezer/pantry.' });
    return;
  }
  const normalizedDate = String(body.expirationDate ?? '').trim();
  if (!normalizedDate) {
    res.status(400).json({ error: 'invalid_expiration_date', message: 'Потрібна дата придатності.' });
    return;
  }

  const category = normalizeProductCategory({
    name: body.name,
    brand: body.brand,
    category: body.category
  });

  const effectiveExpirationDate = body.location === 'freezer' ? FREEZER_EXPIRATION_SENTINEL : normalizedDate;
  const originalExpirationDate = body.location === 'freezer' ? normalizedDate : undefined;

  const duplicate = findInventoryDuplicate({
    barcode,
    expirationDate: effectiveExpirationDate,
    originalExpirationDate,
    location: body.location
  });
  if (duplicate) {
    const merged = updateInventoryItem(duplicate.id, { quantity: duplicate.quantity + quantity });
    if (!merged) {
      res.status(500).json({ error: 'merge_failed', message: 'Не вдалося обʼєднати дублікати товару.' });
      return;
    }

    const noteTrim = typeof body.note === 'string' ? body.note.trim() : '';
    upsertProduct({
      barcode,
      name: body.name.trim(),
      brand: body.brand?.trim() || undefined,
      category,
      imageUrl: body.imageUrl,
      note: noteTrim || undefined,
      taughtByUser: true
    });

    res.status(200).json({
      ...merged,
      insight: getInventoryInsight(merged)
    });
    return;
  }

  const item: InventoryItem = {
    ...body,
    quantity,
    expirationDate: effectiveExpirationDate,
    originalExpirationDate,
    barcode,
    category,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };

  const { note: _note, ...forInsert } = item;
  insertInventoryItem(forInsert);

  const noteTrim = typeof body.note === 'string' ? body.note.trim() : '';
  upsertProduct({
    barcode,
    name: item.name.trim(),
    brand: item.brand?.trim() || undefined,
    category,
    imageUrl: item.imageUrl,
    note: noteTrim || undefined,
    taughtByUser: true
  });

  res.status(201).json({
    ...forInsert,
    insight: getInventoryInsight(forInsert)
  });
});

app.delete('/inventory/:id', (req, res) => {
  deleteInventoryItem(req.params.id);
  res.status(204).send();
});

app.patch('/inventory/:id', (req, res) => {
  const body = req.body as { quantity?: unknown; location?: unknown };
  const patch: Partial<Pick<InventoryItem, 'quantity' | 'location'>> = {};

  if (typeof body.quantity !== 'undefined') {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q <= 0) {
      res.status(400).json({ error: 'invalid_quantity', message: 'Кількість має бути числом більше 0.' });
      return;
    }
    patch.quantity = Math.max(1, Math.round(q));
  }

  if (typeof body.location !== 'undefined') {
    if (body.location !== 'fridge' && body.location !== 'freezer' && body.location !== 'pantry') {
      res.status(400).json({ error: 'invalid_location', message: 'Location має бути fridge/freezer/pantry.' });
      return;
    }
    patch.location = body.location;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'empty_patch', message: 'Передайте хоча б quantity або location.' });
    return;
  }

  const current = findInventoryItemById(req.params.id);
  if (!current) {
    res.status(404).json({ error: 'not_found', message: 'Продукт не знайдено.' });
    return;
  }

  let updated: InventoryItem | undefined;
  let mergedRemovedId: string | undefined;
  const targetLocation = patch.location;
  if (targetLocation && targetLocation !== current.location) {
    const targetDateForLookup =
      targetLocation === 'freezer'
        ? FREEZER_EXPIRATION_SENTINEL
        : current.location === 'freezer'
          ? current.originalExpirationDate ?? current.expirationDate
          : current.expirationDate;
    const targetOriginalForLookup =
      targetLocation === 'freezer' ? current.originalExpirationDate ?? current.expirationDate : undefined;

    const duplicate = findInventoryDuplicate({
      barcode: current.barcode,
      expirationDate: targetDateForLookup,
      originalExpirationDate: targetOriginalForLookup,
      location: targetLocation
    });

    if (duplicate && duplicate.id !== current.id) {
      const currentQty = typeof patch.quantity === 'number' ? patch.quantity : current.quantity;
      const mergedQty = currentQty + duplicate.quantity;
      updated = updateInventoryItem(current.id, {
        quantity: mergedQty,
        location: targetLocation
      });
      deleteInventoryItem(duplicate.id);
      mergedRemovedId = duplicate.id;
    } else {
      updated = updateInventoryItem(req.params.id, patch);
    }
  } else {
    updated = updateInventoryItem(req.params.id, patch);
  }

  if (!updated) {
    res.status(404).json({ error: 'not_found', message: 'Продукт не знайдено.' });
    return;
  }

  res.json({
    item: {
      ...updated,
      insight: getInventoryInsight(updated)
    },
    mergedRemovedId
  });
});

app.get('/recipes', (_req, res) => {
  res.json(buildRecipeSuggestions(listInventory()));
});

function resolveAiItems(itemIds: unknown): InventoryItem[] {
  const all = listInventory();
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return all;
  }

  const ids = new Set(
    itemIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (ids.size === 0) {
    return all;
  }

  const selected = all.filter((item) => ids.has(item.id));
  return selected.length > 0 ? selected : all;
}

async function handleAiRecipesRequest(items: InventoryItem[], res: express.Response) {
  try {
    const recipes = await generateAiRecipeSuggestions(items);
    res.json(recipes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiNotConfiguredError || message === 'AI_API_KEY_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'ai_unconfigured',
        message:
          'Додайте ключ OpenAI-формату (sk-...) у .env сервера: OPENAI_API_KEY, AI_API_KEY або APIFREE_KEY. Для сумісного провайдера можна додати OPENAI_BASE_URL. PEXELS_KEY — лише фото, для рецептів не підходить.'
      });
      return;
    }
    if (error instanceof AiInvalidApiKeyError || message === 'AI_INVALID_API_KEY') {
      res.status(503).json({
        error: 'ai_invalid_key',
        message: 'AI ключ недійсний. Оновіть OPENAI_API_KEY / AI_API_KEY / APIFREE_KEY у apps/server/.env і перезапустіть сервер.'
      });
      return;
    }
    if (error instanceof AiRateLimitedError || message === 'AI_RATE_LIMITED') {
      res.status(429).json({
        error: 'ai_rate_limited',
        message: 'AI тимчасово перевищив ліміт запитів. Спробуйте ще раз через хвилину.'
      });
      return;
    }
    if (error instanceof AiServiceUnavailableError || message === 'AI_SERVICE_UNAVAILABLE') {
      res.status(503).json({
        error: 'ai_service_unavailable',
        message: 'AI сервіс тимчасово недоступний. Спробуйте трохи пізніше.'
      });
      return;
    }
    res.status(502).json({
      error: 'ai_failed',
      message: 'Не вдалося згенерувати AI-рецепти. Перевірте налаштування ключа та спробуйте ще раз.'
    });
  }
}

app.get('/recipes/ai', async (_req, res) => {
  await handleAiRecipesRequest(listInventory(), res);
});

app.post('/recipes/ai', async (req, res) => {
  const itemIds = (req.body as { itemIds?: unknown } | undefined)?.itemIds;
  await handleAiRecipesRequest(resolveAiItems(itemIds), res);
});

app.post('/ai/expiry-from-image', async (req, res) => {
  const body = req.body as { imageBase64?: unknown; mimeType?: unknown };
  const base64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim() : 'image/jpeg';

  if (!base64) {
    res.status(400).json({ error: 'invalid_image', message: 'Порожнє зображення. Зробіть фото ще раз.' });
    return;
  }

  try {
    const parsed = await parseExpiryDateFromImage(`data:${mimeType};base64,${base64}`);
    res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiNotConfiguredError || message === 'AI_API_KEY_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'ai_unconfigured',
        message: 'AI не налаштовано: додайте OPENAI_API_KEY / AI_API_KEY / APIFREE_KEY у apps/server/.env.'
      });
      return;
    }
    if (error instanceof AiInvalidApiKeyError || message === 'AI_INVALID_API_KEY') {
      res.status(503).json({
        error: 'ai_invalid_key',
        message: 'AI ключ недійсний. Оновіть OPENAI_API_KEY / AI_API_KEY / APIFREE_KEY у apps/server/.env.'
      });
      return;
    }
    if (error instanceof AiRateLimitedError || message === 'AI_RATE_LIMITED') {
      res.status(429).json({
        error: 'ai_rate_limited',
        message: 'Ліміт запитів AI перевищено. Спробуйте пізніше.'
      });
      return;
    }
    if (error instanceof AiServiceUnavailableError || message === 'AI_SERVICE_UNAVAILABLE') {
      res.status(503).json({
        error: 'ai_service_unavailable',
        message: 'AI сервіс тимчасово недоступний. Спробуйте пізніше.'
      });
      return;
    }
    if (message === 'EXPIRY_DATE_NOT_FOUND') {
      res.status(422).json({
        error: 'expiry_not_found',
        message: 'Не вдалося розпізнати дату придатності на фото. Спробуйте ближче/чіткіше фото.'
      });
      return;
    }
    res.status(502).json({
      error: 'ai_failed',
      message: 'Не вдалося розпізнати дату з фото.'
    });
  }
});

app.post('/ai/name-from-image', async (req, res) => {
  const body = req.body as { imageBase64?: unknown; mimeType?: unknown };
  const base64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim() : 'image/jpeg';

  if (!base64) {
    res.status(400).json({ error: 'invalid_image', message: 'Порожнє зображення. Зробіть фото ще раз.' });
    return;
  }

  try {
    const parsed = await parseProductNameFromImage(`data:${mimeType};base64,${base64}`);
    res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiNotConfiguredError || message === 'AI_API_KEY_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'ai_unconfigured',
        message: 'AI не налаштовано: додайте OPENAI_API_KEY / AI_API_KEY / APIFREE_KEY у apps/server/.env.'
      });
      return;
    }
    if (error instanceof AiInvalidApiKeyError || message === 'AI_INVALID_API_KEY') {
      res.status(503).json({
        error: 'ai_invalid_key',
        message: 'AI ключ недійсний. Оновіть OPENAI_API_KEY / AI_API_KEY / APIFREE_KEY у apps/server/.env.'
      });
      return;
    }
    if (error instanceof AiRateLimitedError || message === 'AI_RATE_LIMITED') {
      res.status(429).json({
        error: 'ai_rate_limited',
        message: 'Ліміт запитів AI перевищено. Спробуйте пізніше.'
      });
      return;
    }
    if (error instanceof AiServiceUnavailableError || message === 'AI_SERVICE_UNAVAILABLE') {
      res.status(503).json({
        error: 'ai_service_unavailable',
        message: 'AI сервіс тимчасово недоступний. Спробуйте пізніше.'
      });
      return;
    }
    if (message === 'PRODUCT_NAME_NOT_FOUND') {
      res.status(422).json({
        error: 'product_name_not_found',
        message: 'Не вдалося розпізнати назву на фото. Спробуйте ближче або введіть вручну.'
      });
      return;
    }
    res.status(502).json({
      error: 'ai_failed',
      message: 'Не вдалося розпізнати назву з фото.'
    });
  }
});

app.get('/insights/urgent', (_req, res) => {
  const urgent = getUrgentInventory().map((item) => ({
    ...item,
    insight: getInventoryInsight(item)
  }));
  res.json(urgent);
});

app.post('/push/register', (req, res) => {
  const registration = req.body as PushRegistration;
  savePushToken(registration);
  res.status(201).json({ ok: true });
});

app.post('/push/unregister', (req, res) => {
  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    res.status(400).json({ error: 'invalid_token', message: 'Потрібен token.' });
    return;
  }
  deletePushToken(token);
  res.status(200).json({ ok: true });
});

app.post('/push/send-now', async (_req, res) => {
  const result = await sendReminderPushes();
  res.json(result);
});

cron.schedule('0 9 * * *', async () => {
  await sendReminderPushes();
});

app.listen(port, () => {
  console.log(`AppFridge server listening on http://localhost:${port}`);
});
