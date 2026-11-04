# Esco Trade — Architecture

## System Overview (Mermaid)

```mermaid
flowchart TD
    Browser[Web Browser] -->|HTTPS| LB[Load Balancer / Reverse Proxy]
    LB --> Web[Next.js App (apps/web)]
    LB --> API[Fastify API (apps/api)]

    subgraph "Browser (client)"
        Web
        TVLC[TradingView Lightweight Charts]
        SW[Service Worker / focus]
    end

    subgraph "API process (apps/api)"
        Auth[Auth module]
        Inst[Instruments module]
        MD[Market Data module]
        WL[Watchlists module]
        LY[Layouts module]
        Notif[Notifications module]
        Worker[Background worker]
    end

    API --> DB[(PostgreSQL + Prisma)]
    API --> Redis[(Redis — Phase 2)]
    Worker --> DB
    Worker --> Redis

    subgraph "Market Data Providers"
        Demo[DEMO adapter (seeded)]
        AV[Alpha Vantage adapter — Phase 1 real]
    end

    MD --> Demo
    MD --> AV

    subgraph "External"
        AV_HTTPS[Alpha Vantage HTTPS API]
    end

    AV --> AV_HTTPS

    style Browser fill:#1e1e2e,color:#cdd6f4
    style Web fill:#1e1e2e,color:#cdd6f4
    style API fill:#1e1e2e,color:#cdd6f4
    style DB fill:#1e1e2e,color:#cdd6f4
    style Redis fill:#1e1e2e,color:#cdd6f4
```

## Layers

### Web (apps/web) — Next.js App Router
- React + TypeScript strict, Tailwind CSS, Radix UI primitives.
- TanStack Query for server-state; Zustand only for local UI state (panel collapse, search open state).
- TradingView Lightweight Charts for candlestick/volume/line/area/OHLC.
- Chart preferences persisted per user via layouts module.
- Keyboard-navigable symbol search dialog (Cmd/Ctrl+K).
- Dark/light theme via Tailwind `dark:` variants + a theme toggle persisted in preferences.

### API (apps/api) — Fastify + TypeScript
- Modular monolith: auth, instruments, marketdata, watchlists, layouts, alerts, portfolio, notifications.
- One background worker process (BullMQ in Phase 2; not in Phase 1).
- Zod schemas shared from packages/shared for request/response validation.
- Versioned WebSocket message schemas (Phase 2).
- Security: HTTP-only Secure SameSite session cookies, CSRF, CORS, security headers, rate limiting, audit logging (scaled in per phase).

### Shared (packages/shared)
- Zod schemas, TypeScript types for instruments, watchlists, layouts, messages.
- HTTP API contract + WebSocket message schemas.

### Indicators (packages/indicators)
- Pure, framework-free math: SMA, EMA, RSI, MACD, Bollinger Bands, VWAP.
- No look-ahead bias; warm-up Semantics documented in docs/INDICATORS.md.
- Tested against known fixtures.

### Data
- PostgreSQL + Prisma migrations.
- Market data tables separate from user-owned records.
- Decimal arithmetic via decimal.js in code; NUMERIC in Postgres.

## Market Data Architecture

### Provider-independent interface
```
MarketDataProvider {
  search(query) -> Instrument[]
  metadata(instrumentId) -> Instrument
  historical(instrumentId, timeframe, range) -> OHLCV[]
  latestQuote(instrumentId) -> Quote | null
  calendar? -> sessions
  corporateActions? -> ...
}
```

### Instrument identity
- Internal ID (UUID), provider-specific IDs, exchange/venue, asset type, trading currency, exchange timezone.
- A ticker alone is never the key.

### Adapter strategy
- Phase 1: DEMO adapter (seeded, deterministic) + one real adapter (Alpha Vantage for US equities).
- Real adapter disabled for public live-data redistribution until licensing verified (see docs/DATA_LICENSING.md).
- Cache keys include instrument, timeframe, session, adjustment mode.
- Every dataset exposed to UI: source, latest observation time, status (live/delayed/demo/stale), currency, timezone and session context, adjustment mode.

### Hardening (Phase 2, designed now)
- Env-based config, request timeouts, bounded retries with jitter, rate-limit handling, circuit breaker, subscription deduplication with reference counting, reconnect with backfill and gap detection, duplicate/out-of-order handling, explicit outage state.
- NEVER silently substitute fake data on provider failure — show error or stale state.
- API secrets stay server-side; none in browser bundles.

## Cross-cutting concerns (from Phase 1)
- Security headers, CSRF, CORS, rate limiting, audit logging for sensitive actions.
- Input validation via Zod.
- Ownership checks on every protected resource.

## Workload assumptions
- Concurrent users: modest (Phase 1 dev/early-access scale; load tests in Phase 4).
- Symbols per user: tens to low hundreds.
- Shared upstream subscriptions: per-instrument across all browser clients (Phase 2 WebSocket; Phase 1 polling).
- Tick rate: OHLCV candles; intraday 1m in Phase 2 streaming; Phase 1 historical + latest quote polling.
- Retention: OHLCV kept for trading sessions; high-volume ticks not stored without a documented retention/partitioning plan (documented as a limitation until then).
- Region: US equities primary; INDICES/INTL deferred.

## Latency / availability / freshness targets (Phase 1 intent, to be measured in Phase 4)
- API response for chart historical data: p95 < 500ms at low load (target, not yet measured).
- Latest quote freshness: demo deterministic; real adapter governed by provider rate limits and cache TTL.
- Availability: local dev single-instance; HA not in scope until Phase 4.
