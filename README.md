# Kansha Care Earthquake Monitor

A small real-time monitoring system for the Kansha Care founding engineer assignment. It ingests USGS earthquake feeds, shows live operational dashboards, lets users monitor up to 3 locations, and sends Telegram alerts when something needs attention.

![Kansha simple architecture preview](docs/kansha-simple-architecture-preview.png)

## Features

- 30-day USGS backfill from `all_month.geojson`
- Live polling every minute from `all_hour.geojson`
- Startup catch-up from `all_day.geojson`
- Global event dashboard with map, search, filters, and health status
- Per-location risk scores, nearby events, and editable alert rules
- Telegram linking with short-lived one-time tokens
- Global, local, swarm, source-silence, and daily-summary alerts
- Admin view for users, locations, Telegram links, and health
- AI assistant on the dashboard and Telegram for summaries, searches, and approved actions

## Tech Stack

- Monorepo: `pnpm` and Turborepo
- Web: React, Vite, TypeScript, Tailwind, Leaflet, Framer Motion
- API: Node.js, Hono, Zod, JWT cookies, AI SDK
- Worker: BullMQ, Redis, Telegraf, Telegram Bot API
- Database: Postgres, Drizzle ORM, Drizzle migrations
- Shared packages: `db`, `types`, `ui`, and `agent`
- Tests: Vitest

## Project Structure

- `apps/web`: landing page, auth, dashboard, admin UI, assistant widget
- `apps/api`: auth, dashboard, locations, Telegram, admin, and agent routes
- `apps/worker`: ingestion jobs, alert jobs, Telegram bot, daily summaries
- `packages/db`: schema and migrations
- `packages/types`: shared DTOs, USGS parsing, risk scoring, geo helpers
- `packages/agent`: assistant tools, prompts, conversations, approved actions
- `docs/ARCHITECTURE.md`: architecture notes and scaling plan

## Run Locally

Prerequisites: Node.js, `pnpm`, Postgres, Redis, a Telegram bot token, and an OpenAI API key.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```

Fill the three `.env` files. The important values are:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`
- `OPENAI_API_KEY`
- `GEOCODER_USER_AGENT`

Then run:

```bash
pnpm db:migrate
pnpm dev
```

Open:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`

The worker will backfill the last 30 days first, then continue polling live data every minute.

## Telegram Setup

1. Create a bot with `@BotFather`.
2. Put the token in `apps/worker/.env`.
3. Put the bot username in `apps/api/.env`.
4. Start the app with `pnpm dev`.
5. Sign in, open the dashboard, and click **Connect Telegram**.
6. Open the generated Telegram link and press Start.

## Useful Commands

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm db:generate
pnpm db:migrate
```

## Deployment Notes

The intended split is simple:

- Web on Vercel
- API and worker on a VM
- Postgres and Redis from managed providers

`docker-compose.yml` runs the API and worker containers. It expects production `.env` files and external Postgres/Redis URLs.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system diagram, data flow, scaling notes, failure modes, and deliberate omissions.
