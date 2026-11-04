# Esco Trade — Data Licensing Notes

## Status
DRAFT — reflects assumptions at Phase 0. Update after verifying provider terms and before any live-data distribution.

## Provider: Alpha Vantage (real adapter)
- API: documented REST API (Alpha Vantage).
- Coverage: US equities historical time series and quotes (within the free tier's scope).
- Use in this project: personal/non-redistributed viewing only in Phase 1.
- Free-tier rate limits apply; handled by caching and bounded retries + jitter (designed; not fully wired in Phase 1).
- Display permissions: NOT verified for public redistribution of live/delayed data. Until verified, live-data display is disabled in the UI; real-adapter data is shown only to the authenticated owner with clear "real (non-redistributed)" labeling and may be restricted to personal use.

## Redistribution / display restrictions
- A ticker is not the key; we store instrument identity + provider ID and label source/status.
- Market data tables are separate from user-owned records.
- No public live-data distribution until licensing verified (see below).
- Every dataset the UI exposes includes: source, latest observation time, status (live/delayed/demo/stale), currency, timezone and session context, adjustment mode where applicable.

## DEMO adapter
- Deterministic, seeded, clearly badged "DEMO" in the UI.
- Not presented as real or live. No licensing concerns because it is synthetic.

## TradingView Lightweight Charts
- Used for the chart component.
- License: Apache 2.0 (to be verified at integration time; if changed, update this doc and the attribution notice in the app).
- Attribution notice: include the required attribution as specified by the library's license/docs, e.g. "This app uses TradingView Lightweight Charts, licensed under Apache 2.0." Render it in the app's about/attribution area and in docs/LICENSES.md.
- Drawing tools (trend line, rectangle, Fibonacci) are NOT provided by Lightweight Charts; any drawings are a scoped overlay, or documented as a limitation.

## Open licensing questions (to resolve before public launch)
1. Does Alpha Vantage's terms permit displaying delayed/live equity quotes in a web app to authenticated users, and any display-rate or attribution requirements?
2. Are exchange-licensed data display restrictions (venue-specific) relevant for the equities we show?
3. For any "real" data shown before verification: restrict to personal use and clearly label as non-redistributed; do not expose publicly.
4. Corporate actions / split adjustments: confirm provider provides adjusted data and the adjustment mode we should expose.

## Secrets
- API keys stay server-side only (apps/api). None in browser bundles.
- .env.example only contains placeholders.

## Action items
- [ ] Verify Alpha Vantage terms for display/redistribution; update this doc and either enable or keep disabled live-data display.
- [ ] Confirm Lightweight Charts license + attribution text at integration.
- [ ] Add LICENSES.md with attribution notices.
