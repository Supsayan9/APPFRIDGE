import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cron from 'node-cron';
import { buildRecipeSuggestions, getInventoryInsight, type InventoryItem, type PushRegistration } from '@appfridge/shared';
import { deleteInventoryItem, initDb, insertInventoryItem, listInventory, savePushToken } from './db.js';
import { AiNotConfiguredError, generateAiRecipeSuggestions } from './aiRecipes.js';
import { lookupProduct } from './lookup.js';
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
  const item: InventoryItem = {
    ...body,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };

  insertInventoryItem(item);
  res.status(201).json({
    ...item,
    insight: getInventoryInsight(item)
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
          'Додайте ключ OpenAI у .env сервера: OPENAI_API_KEY або AI_API_KEY (https://platform.openai.com/api-keys). PEXELS_KEY — це інший сервіс (фото), для рецептів не підходить.'
      });
      return;
    }
    res.status(502).json({
      error: 'ai_failed',
      message: message.slice(0, 400)
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
