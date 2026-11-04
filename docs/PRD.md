# Esco Trade — PRD Summary

## Product Vision
Esco Trade is a real stock tracking and technical-analysis web app inspired by TradingView's usability, with fully original branding, design, and code. It is a market-analysis product — not a brokerage — with no order execution, no brokerage credentials, and no investment advice.

## Target Users
- Retail traders and analysts who want technical charts, watchlists, alerts, and a personal portfolio tracker.
- Users who value a clean desktop chart workspace with collapsible panels, keyboard shortcuts, and saved layouts.

## Core Capabilities (MVP / Phase 1)
1. **Authentication**: secure sign-in/out, session cookies, email verification placeholder.
2. **Symbol search**: keyboard-navigable dialog (Cmd/Ctrl+K), instrument search by ticker/name.
3. **Chart workspace**: candlestick + volume, crosshair with OHLCV tooltip, zoom/pan/fit, timeframe switching (1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M), log/linear scale.
4. **Demo market data**: deterministic seeded adapter, clearly badged "DEMO" in the UI.
5. **Watchlist**: one persistent named list, add/remove/reorder, per-row stale indicators.
6. **Data-status UI**: visible source, latest observation time, status (live/delayed/demo/stale), currency, timezone.

## Phase 1 Scope (vertical slice)
- App shell and themes (dark/light).
- Auth (Auth.js / Better Auth — decision deferred to implementation).
- Symbol search dialog.
- Demo adapter (seeded, deterministic).
- One real adapter (choice: Yahoo Finance unofficial is unreliable and sometimes illegal to redistribute; Alpha Vantage free tier covers US equities and supports historical candles/quotes, documented, free tier available — chosen as real adapter; see docs/DATA_LICENSING.md).
- Candlestick + volume chart with crosshair/zoom/pan/timeframes/log scale.
- TradingView Lightweight Charts for the chart component (see attribution requirements).
- One persistent watchlist.
- Docker Compose local env.
- .env.example with placeholders.
- Migrations + seed.
- Unit + integration tests.
- Playwright E2E: sign in → search → open chart → add to watchlist → reload → confirm persistence.
- Ownership negative tests: user A cannot read/modify user B's watchlists.

## Out of Scope (Phase 1)
- Redis, WebSocket streaming, indicators, alerts, portfolio, drawings, notifications, observability.
- Live data distribution (disabled until licensing verified).

## Success Criteria (Phase 1)
- `docker compose up` works from a clean clone.
- Lint, typecheck, tests, build all pass.
- Demo mode works with no external credentials.
- E2E flow passes.
- Ownership negative tests pass.
