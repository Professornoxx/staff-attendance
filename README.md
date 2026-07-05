# staff-attendance

Telegram-based staff attendance and shift management system.

## Structure

- `worker/` — Cloudflare Worker backend: Telegram bot (grammY), admin REST API (Hono), D1 database, cron cleanup.
- `dashboard/` — Cloudflare Pages admin dashboard (React + Vite), deployed separately.

## Deploying the worker

```bash
cd worker
npm install
npx wrangler deploy
```

Secrets (never committed) are set via:
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

## Deploying the dashboard

```bash
cd dashboard
npm install
npm run build
npx wrangler pages deploy dist --project-name=attendance-dashboard
```
