# AppFridge Telegram Mini App

## Local run

```bash
cd apps/telegram-web
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy (Railway)

Create a new Railway service for this app with:

- Root Directory: `apps/telegram-web`
- Build Command: `npm install && npm run build`
- Start Command: `npm run preview`

Optional env:

- `VITE_API_URL=https://appfridgeserver-production.up.railway.app`
- `PORT` is provided by Railway automatically.

## Connect to Telegram

1. Open `@BotFather`.
2. Create bot: `/newbot`.
3. Set Mini App button URL:
   - `/mybots` -> your bot -> **Bot Settings** -> **Menu Button**
   - URL: your Railway URL for this mini app (e.g. `https://your-miniapp.up.railway.app`)
4. Open your bot in Telegram and tap the menu button.

## Notes

- This mini app uses profile switch (`vlad`/`rimma`) and reads inventory + AI recipes from your Railway backend.
- Camera barcode scanning is better in native mobile app; Mini App is best for quick access and recipe flows.
