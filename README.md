# The Levant Bakehouse — Deployment Guide

A day-1 bakery operations tracker for **The Levant Bakehouse** (Healthy Loaf · Oat Bread).
Tracks production, deliveries, samples, payments, expenses, returns, outstanding balances per store, restocks, raw-material stock, and critical thresholds.

---

## What's in this package

```
.
├── DEPLOY.md                       <- this file
├── package.json                    <- root workspace
├── pnpm-workspace.yaml             <- workspace + dependency catalog
├── pnpm-lock.yaml                  <- locked dependency versions
├── tsconfig.json / tsconfig.base.json
├── .npmrc
├── .gitignore
│
├── artifacts/
│   ├── api-server/                 <- BACKEND: Express 5 + Drizzle ORM
│   │   ├── src/                    <- routes, middlewares, lib
│   │   │   ├── index.ts            <- entry (reads PORT)
│   │   │   ├── app.ts              <- express app setup
│   │   │   └── routes/bakery.ts    <- all business logic & calculations
│   │   ├── build.mjs               <- esbuild bundler
│   │   └── package.json
│   │
│   └── bakery/                     <- FRONTEND: React 19 + Vite + Tailwind
│       ├── src/
│       │   ├── App.tsx             <- router
│       │   ├── pages/              <- dashboard, daily-ops, stores,
│       │   │                          cash-log, settings, analytics
│       │   ├── components/         <- UI components (shadcn-style)
│       │   ├── hooks/              <- React Query hooks
│       │   └── lib/                <- helpers, exports.ts (Excel)
│       ├── index.html
│       ├── vite.config.ts          <- proxies /api to backend
│       └── package.json
│
└── lib/
    ├── db/                         <- Drizzle schema (single source of truth)
    │   ├── src/schema/bakery.ts    <- all 9 tables defined here
    │   ├── src/index.ts            <- pg pool + drizzle client
    │   └── drizzle.config.ts
    ├── api-spec/                   <- OpenAPI spec (the API contract)
    │   └── openapi.yaml
    ├── api-zod/                    <- generated: Zod schemas (don't edit)
    └── api-client-react/           <- generated: typed React Query hooks
```

The frontend talks to the backend through generated typed hooks in `lib/api-client-react`.
The contract is `lib/api-spec/openapi.yaml`. If you ever change it, regenerate with:
`pnpm --filter @workspace/api-spec run codegen`.

---

## Prerequisites on your server

1. **Node.js 24** (v20+ will likely work, v24 is what was used)
2. **pnpm 9+** — install with `npm i -g pnpm`
3. **PostgreSQL 14+** (any host: local, RDS, Supabase, Neon, etc.)
4. A reverse proxy (nginx, Caddy, etc.) if you want HTTPS in front

---

## Environment variables

Create a `.env` file or export these before starting each service.

### Backend (`artifacts/api-server`)
| Variable       | Required | Example                                                     |
|----------------|----------|-------------------------------------------------------------|
| `PORT`         | yes      | `3000`                                                      |
| `DATABASE_URL` | yes      | `postgres://user:pass@host:5432/levant_bakehouse`           |
| `NODE_ENV`     | no       | `production`                                                |
| `LOG_LEVEL`    | no       | `info` (default), `debug`, `warn`, `error`                  |

### Frontend (`artifacts/bakery`) — only used at build/dev time
| Variable             | Required | Example                                              |
|----------------------|----------|------------------------------------------------------|
| `PORT`               | no       | `5173` (dev/preview port)                            |
| `BASE_PATH`          | no       | `/` (default). Set to `/bakery/` if hosted at a sub-path |
| `API_PROXY_TARGET`   | no       | `http://localhost:3000` (used by dev proxy)          |

In **production**, the frontend is a static bundle (HTML/JS/CSS). Its calls go to `/api/...`,
which your reverse proxy must forward to the backend.

---

## Setup (one-time)

```bash
# 1. Install dependencies for the whole workspace
pnpm install

# 2. Create the database schema (creates 9 tables in your Postgres)
DATABASE_URL=postgres://... pnpm --filter @workspace/db run push
```

That's it — **no SQL migration files to run**. Drizzle reads the schema from
`lib/db/src/schema/bakery.ts` and creates all tables for you. The 9 tables are:

| Table                       | Purpose                                                  |
|-----------------------------|----------------------------------------------------------|
| `bakery_settings`           | Current settings (price, batch yield, opening cash, etc.)|
| `bakery_settings_versions`  | Append-only history of settings changes                  |
| `bakery_recipes`            | Per-batch raw-material requirements                      |
| `bakery_critical_levels`    | Per-material low-stock thresholds                        |
| `bakery_restocks`           | Raw-material purchases (also flows into expenses logic)  |
| `bakery_stores`             | Customer stores                                          |
| `bakery_ops`                | Batches, deliveries, samples (with **price snapshot**)   |
| `bakery_cash`               | Standalone payments received                             |
| `bakery_expenses`           | General expenses                                         |

---

## Build & run (production)

```bash
# Build everything
pnpm run build

# Backend output:  artifacts/api-server/dist/index.mjs
# Frontend output: artifacts/bakery/dist/public/  (static HTML/JS/CSS)
```

### Run the backend
```bash
PORT=3000 \
DATABASE_URL=postgres://... \
NODE_ENV=production \
node artifacts/api-server/dist/index.mjs
```

A process manager like **systemd**, **pm2**, or **Docker** is recommended.

#### Example systemd unit (`/etc/systemd/system/bakehouse-api.service`)
```ini
[Unit]
Description=Levant Bakehouse API
After=network.target postgresql.service

[Service]
Type=simple
User=bakehouse
WorkingDirectory=/opt/bakehouse
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgres://user:pass@localhost:5432/levant_bakehouse
ExecStart=/usr/bin/node artifacts/api-server/dist/index.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Serve the frontend
The frontend is just static files in `artifacts/bakery/dist/public/`. Serve them with
nginx, Caddy, Apache, or any static host. Make sure `/api/*` is proxied to the backend.

#### Example nginx config
```nginx
server {
    listen 80;
    server_name bakehouse.example.com;

    root /opt/bakehouse/artifacts/bakery/dist/public;
    index index.html;

    # SPA fallback — all non-asset routes return index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Forward API calls to the backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Example Caddy config
```
bakehouse.example.com {
    root * /opt/bakehouse/artifacts/bakery/dist/public
    encode gzip
    file_server
    try_files {path} /index.html

    handle_path /api/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

---

## Local development (optional)

```bash
# Terminal 1 — backend (auto-rebuilds on save with --watch if you wish)
PORT=3000 DATABASE_URL=postgres://... pnpm --filter @workspace/api-server run dev

# Terminal 2 — frontend (Vite dev server with /api proxy)
PORT=5173 API_PROXY_TARGET=http://localhost:3000 pnpm --filter @workspace/bakery run dev
```

Then open `http://localhost:5173`.

---

## First-time use

Once deployed, open the app in a browser and:

1. Go to **Settings** and configure:
   - Price per pack, packs per batch, opening cash, currency label
   - Recipe (raw materials needed per batch)
   - Critical levels (alert thresholds for each raw material)
2. Go to **Operations** to log your first batch / delivery / payment / expense.
3. View **Dashboard** and **Analytics** for executive reporting.

All numbers are **append-only**: editing a setting (e.g. price) will not retroactively change past
delivery values. Each delivery snapshots the price effective on its date.

---

## Backups

Daily `pg_dump` of your Postgres database is the only backup needed.

```bash
pg_dump $DATABASE_URL > /backups/bakehouse-$(date +%F).sql
```

To restore: `psql $DATABASE_URL < /backups/bakehouse-2026-01-01.sql`.

The Settings page also has an **Export all data (Excel)** button that produces a multi-sheet
workbook for ad-hoc analysis or as a human-readable backup.

---

## Tech stack reference

- **Backend**: Node.js 24, Express 5, Drizzle ORM, pg (node-postgres), Pino (logging), Zod (validation)
- **Frontend**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, shadcn-style Radix components, TanStack React Query, Wouter (router), Recharts (charts), xlsx (exports)
- **API contract**: OpenAPI 3 (`lib/api-spec/openapi.yaml`) → Orval → Zod schemas + typed React Query hooks

---

## Troubleshooting

- **`DATABASE_URL must be set`** — export it before any `pnpm` command that touches the DB.
- **Tables don't exist** — run `pnpm --filter @workspace/db run push`.
- **Frontend loads but API calls fail** — your reverse proxy isn't forwarding `/api/*` to the backend, or CORS / hostnames don't match.
- **Schema change after deploy** — edit `lib/db/src/schema/bakery.ts`, then re-run `pnpm --filter @workspace/db run push`. For destructive changes use `push-force`.
