# Esco Trade — Repository Structure

```
esco-trade/
├── README.md
├── .env.example
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json            # root: scripts + workspace deps
├── pnpm-lock.yaml
├── tsconfig.base.json      # shared TS config baseline
├── .editorconfig
├── .gitignore
├── .eslintrc?              # chosen during implementation
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DB_MODEL.md
│   ├── DECISIONS.md
│   ├── DATA_LICENSING.md
│   ├── INDICATORS.md
│   ├── ALERTS.md
│   ├── WORKLOADS.md
│   ├── CHECKLIST.md
│   ├── REPO_STRUCTURE.md
│   ├── DATA_FLOWS.md       # Phase 0/1 data flow narrative
│   └── (later) INDICATORS.md fixture refs, etc.
├── apps/
│   ├── web/                # Next.js App Router
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── app/        # App Router routes
│   │   │   ├── components/ # UI components (chart, watchlist, search, panels)
│   │   │   ├── hooks/      # TanStack Query hooks, Zustand stores
│   │   │   ├── lib/        # client utils, theme, Lightweight Charts wrapper
│   │   │   ├── styles/     # Tailwind + global styles
│   │   │   └── types/      # shared types re-exported from packages/shared
│   │   └── ...
│   └── api/                # Fastify + TypeScript modular monolith
│       ├── package.json
│       ├── src/
│       │   ├── app.ts      # Fastify bootstrap
│       │   ├── modules/    # auth, instruments, marketdata, watchlists, layouts, alerts, portfolio, notifications
│       │   ├── services/   # provider adapters, portfolio ledger, alert evaluation
│       │   ├── db/         # Prisma client, migrations
│       │   ├── jobs/       # background worker (BullMQ Phase 2)
│       │   └── ...
│       └── prisma/
│           ├── schema.prisma
│           ├── migrations/
│           └── seed.ts
├── packages/
│   ├── shared/             # Zod schemas + TS types for HTTP + WS
│   │   ├── package.json
│   │   └── src/
│   └── indicators/         # pure math: SMA, EMA, RSI, MACD, Bollinger, VWAP
│       ├── package.json
│       └── src/
└── tests/
    ├── e2e/                # Playwright flows
    └── ...
```

Notes:
- Market data adapters live in apps/api/services/providers/ (demo + real).
- Prisma schema + migrations under apps/api/prisma/.
- Docker Compose defines web, api, postgres, and (Phase 2) redis.
- .env.example contains placeholders only; no real secrets committed.
