# AppFridge

Полноценный monorepo-проект для учёта продуктов:

- `apps/mobile`: настоящее мобильное приложение на Expo / React Native
- `apps/server`: backend на Node / Express + SQLite
- `packages/shared`: общая бизнес-логика сроков годности и рецептов

## Что умеет

- сканировать штрихкод с камеры телефона
- определять товар по штрихкоду
- сохранять срок годности в базу данных
- показывать, что скоро испортится
- предлагать простые рецепты по “срочным” продуктам
- регистрировать Expo push token
- отправлять push-напоминания о продуктах с истекающим сроком

## Важное ограничение модели данных

Обычный EAN/UPC штрихкод почти всегда определяет **товар**, но **не дату срока годности**. Поэтому рабочая схема в приложении такая:

1. Сканируете штрихкод.
2. Backend узнаёт, что это за продукт.
3. Пользователь вручную вводит дату окончания.
4. Backend хранит её и шлёт напоминания.

Если когда-нибудь захотите поддержку GS1/DataMatrix с реально зашитой датой, это можно добавить отдельным модулем.

## Структура

```text
apps/
  mobile/   Expo app
  server/   Express + SQLite API
packages/
  shared/   shared expiry + recipe logic
```

## Быстрый запуск

### 1. Установить зависимости

```bash
cd /Users/vladtarasov/Desktop/APPFRIDGE/APPFRIDGE
npm install
```

После `npm install` автоматически соберётся `packages/shared`.

### 2. Настроить backend

Скопируйте пример:

```bash
cp apps/server/.env.example apps/server/.env
```

Минимально достаточно:

```env
PORT=4000
CLIENT_ORIGIN=*
DATABASE_PATH=./appfridge.db
EXPO_ACCESS_TOKEN=
PEXELS_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
# Опционально для OpenAI-compatible провайдера:
# OPENAI_BASE_URL=https://api.apifree.ai
# OPENAI_BASE_URL=https://openrouter.ai/api
# OPENAI_TIMEOUT_MS=25000
```

### 3. Запустить backend

```bash
npm run dev:server
```

Проверка:

```bash
curl http://localhost:4000/health
```

### 4. Настроить mobile app

Скопируйте пример:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

В `apps/mobile/.env` обязательно укажите **локальный IP вашего компьютера**, а не `localhost`, если запускаете на телефоне:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.10:4000
```

Узнать IP на macOS можно так:

```bash
ipconfig getifaddr en0
```

Если у вас Wi‑Fi интерфейс другой, подставьте свой.

### 5. Запустить mobile app

```bash
npm run dev:mobile
```

Дальше:

1. Установите `Expo Go` на телефон.
2. Сканируйте QR-код из терминала.
3. Дайте приложению доступ к камере и уведомлениям.

## Как проверить сценарий целиком

1. Запустите backend.
2. Запустите Expo app на телефоне.
3. Нажмите `Открыть сканер`.
4. Отсканируйте любой штрихкод.
5. Нажмите `Найти товар`.
6. Введите дату срока годности в формате `YYYY-MM-DD`.
7. Сохраните продукт.
8. Проверьте, что продукт появился в списке `Холодильник`.
9. Вызовите ручную отправку push:

```bash
curl -X POST http://localhost:4000/push/send-now
```

Если push token уже зарегистрирован и есть товар со статусом `expiring` или `expired`, уведомление придёт на устройство.

## Push-уведомления

В проекте используется Expo Push Notifications.

Что важно:

- на симуляторе push часто не тестируют, лучше использовать реальное устройство
- backend хранит Expo push token в SQLite
- backend по cron пытается отправлять напоминания каждый день в `09:00`
- есть ручной endpoint `POST /push/send-now` для теста

Если нужен production-grade пуш для App Store / Google Play, потом можно отдельно настроить EAS credentials и нативные сборки.

## API backend

- `GET /health`
- `GET /products/:barcode`
- `GET /inventory`
- `POST /inventory`
- `DELETE /inventory/:id`
- `GET /recipes`
- `GET /insights/urgent`
- `POST /push/register`
- `POST /push/send-now`

## Тесты

```bash
npm test
```

Сейчас тесты покрывают общую бизнес-логику:

- расчёт дней до окончания
- статус `fresh / expiring / expired`
- подбор рецептов по срочным продуктам

## Сборка backend

```bash
npm run build
```

## Что ещё можно улучшить

- авторизация и аккаунты пользователей
- OCR чека вместо сканирования по одному товару
- настоящая AI-генерация рецептов через LLM
- фоновые silent push / job queue
- фото продукта и распознавание по изображению
- DataMatrix / GS1 parsing для тех производителей, которые действительно шьют дату в код
