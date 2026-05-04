import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cron from 'node-cron';
import { buildRecipeSuggestions, getInventoryInsight, type InventoryItem, type PushRegistration } from '@appfridge/shared';
import { deleteInventoryItem, initDb, insertInventoryItem, listInventory, savePushToken, upsertProduct } from './db.js';
import {
  AiInvalidApiKeyError,
  AiNotConfiguredError,
  AiRateLimitedError,
  AiServiceUnavailableError,
  generateAiRecipeSuggestions
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
app.use(express.json());

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

  const category = normalizeProductCategory({
    name: body.name,
    brand: body.brand,
    category: body.category
  });

  const item: InventoryItem = {
    ...body,
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

app.get('/recipes', (_req, res) => {
  res.json(buildRecipeSuggestions(listInventory()));
});

app.get('/recipes/ai', async (_req, res) => {
  try {
    const recipes = await generateAiRecipeSuggestions(listInventory());
    res.json(recipes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiNotConfiguredError || message === 'AI_API_KEY_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'ai_unconfigured',
        message:
          'Додайте ключ OpenAI-формату (sk-...) у .env сервера: OPENAI_API_KEY, AI_API_KEY або APIFREE_KEY. PEXELS_KEY — лише фото, для рецептів не підходить.'
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
