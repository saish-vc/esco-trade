# Esco Trade — Decisions & Assumptions

## Defaults (from the brief, kept unless written justification to change)
- Market: US equities.
- Real data provider: Alpha Vantage (free tier, documented API, covers US equities, supports historical candles and quotes). See docs/DATA_LICENSING.md.
- Stack: pnpm monorepo (apps/web, apps/api, packages/shared, packages/indicators); Next.js App Router; Fastify API; PostgreSQL + Prisma; Tailwind; Radix primitives; TanStack Query; Zustand only for local UI state; TradingView Lightweight Charts; Auth.js/Better Auth; decimal.js; Zod; Vitest + RTL + Playwright + axe; Docker Compose; GitHub Actions.

## Decisions made

### 1. Market = US equities
Assumption: primary market is US equities with USD denomination. International indices/crypto deferred.

### 2. Real provider = Alpha Vantage
- Free tier available; documented REST API.
- Supports TIME_SERIES_DAILY and INTRADAY (where allowed) for US equities; quotes available.
- Rate-limited on free tier; handled via caching and bounded retries + jitter (designed, not fully wired in Phase 1).
- Justification over alternatives:
  - Yahoo Finance unofficial APIs: unreliable, sometimes against ToS, not recommended for redistribution.
  - Polygon/Finnhub/IEX: paid tiers for streaming; free tiers have restrictions; picked Alpha Vantage for documented free tier coverage of US equities historical + quotes.
- Limitation: free tier rate limits may restrict how many instruments can be freshly queried per minute; Phase 1 caches and badges as demo/real accordingly; live-data redistribution disabled until licensing verified.

### 3. Real adapter disabled for public live-data redistribution until verified
- The adapter is implemented and wired for personal/non-redistributed viewing only.
- Public live-data display remains disabled until the provider's entitlements, display permissions, exchange restrictions, and open licensing questions are resolved (see docs/DATA_LICENSING.md).
- UI labels source and status (live/delayed/demo/stale) and never silently substitutes fake data on failure.

### 4. TradingView Lightweight Charts — attribution
- Using TradingView Lightweight Charts for the chart component (candlestick/volume/line/area/OHLC, crosshair, zoom/pan, timeframes, log/linear).
- Lightweight Charts is licensed under Apache 2.0; attribution notice must be included where required. Verified as of the project's knowledge; if the license or API changes, update docs/DATA_LICENSING.md and the attribution notice.
- Limitation: Lightweight Charts does not provide drawing tools (trend lines, rectangles, Fibonacci). Drawing tools are explicitly out of scope for the chart library; implemented drawings (if any) must be built as a scoped overlay if feasible, otherwise documented as a limitation. Phase 1 does not implement drawings.

### 5. Auth library = decision deferred to implementation (Auth.js or Better Auth)
- No hand-rolled password storage or cryptography.
- Phase 1 implements the auth boundary using a mature library; exact choice finalized during implementation.
- Session cookies: HTTP-only, Secure, SameSite; CSRF protection; session revocation; server-side authorization on every protected resource.

### 6. Fastify justification
- Fastify chosen for the API for high-throughput request handling with low overhead, strong plugin/encapsulation model for modular monolith boundaries, and TypeScript-first plugin authoring. Suitable for a single-process modular monolith without microservices. Documented in this file; rationale against Express: schema-driven validation, performance, and structured plugin lifecycle.

### 7. Market data: demo first, real second
- DEMO adapter seeded deterministically and badged "DEMO".
- Real adapter (Alpha Vantage) wired but live-data redistribution disabled until licensing verified.
- Every dataset exposes source, latest observation time, status, currency, timezone/session, adjustment mode.

### 8. Indicators in a separate pure package
- packages/indicators is pure, framework-free math.
- SMA, EMA, RSI, MACD, Bollinger Bands, VWAP documented in docs/INDICATORS.md with formula, parameters, initialization, warm-up, and fixture tests.
- No indicators in Phase 1 (deferred to Phase 2); the package and fixture-tests scaffold is prepared.

### 9. Portfolio: FIFO default, refuse multi-currency totals
- Cost-basis method default FIFO, stated explicitly.
- Fees treated as transaction rows; dividends as transaction rows.
- Refuse summing across currencies without an explicit conversion policy; show limitation instead of misleading total.
- Splits unsupported in Phase 1 — UI message, not silent handling.

### 10. No high-volume tick storage without a documented plan
- OHLCV candles stored for requested ranges; no tick-level storage in ordinary tables without retention/partitioning/capacity plan (documented as a limitation).

### 11. Tooling defaults kept
- Vitest + RTL + Playwright + axe; Docker Compose local; GitHub Actions CI; pino logging (Phase 4 observability deferred but pino chosen now).

### 12. Per-phase reporting and exit gates
- Each phase ends with a report in the requested format; exit gates checked before continuing.

## Assumptions added during Phase 0
- Single-geography dev/early-access; load tests deferred to Phase 4.
- WebSocket streaming deferred to Phase 2 (polling in Phase 1).
- No brokerage, no order execution, no investment advice — out of scope entirely.
