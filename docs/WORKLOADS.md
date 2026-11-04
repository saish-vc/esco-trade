# Esco Trade — Workload Assumptions

## Scale (Phase 1 dev/early-access; load tests in Phase 4)
- Concurrent users: small (single-instance API; HA not in scope until Phase 4).
- Symbols per user: tens to low hundreds.
- Watchlists per user: a few; items per watchlist: tens to low hundreds.

## Data flow (Phase 1)
- Historical OHLCV: fetched per chart open / timeframe change / pagination.
- Latest quote: polled (no WebSocket in Phase 1); cached with TTL.
- Shared upstream subscriptions: not yet (Phase 2 WebSocket introduces per-instrument ref-counted subscriptions across browser clients).

## Tick / candle rate
- Intraday 1m candles where provider supports them.
- Phase 1 no streaming ticks; candle aggregates come from provider/historical endpoints.

## Storage / retention
- OHLCV stored for requested ranges (candle aggregates), indexed by instrument/timeframe/session/timestamp.
- No high-volume tick storage in ordinary tables without a retention/partitioning/capacity plan (documented limitation).
- LatestQuote is a small cache; HistoricalCandle populated on demand and reused while fresh.

## Capacity notes (to revisit in Phase 4)
- Quote fan-out and WebSocket subscription load to be load-tested with k6/Artillery in Phase 4.
- Targets stated in docs/PRD.md (p95 chart historical < 500ms at low load) — to be measured, not asserted.
