# Esco Trade — Indicators

## Common rules
- Pure, framework-free math in `packages/indicators`.
- No look-ahead bias: each value uses only data up to and including the current index.
- Initialize with enough history; return `null` for "insufficient history" (distinct from a real zero).
- Test against deterministic fixtures.
- Heavy computation can move to a Web Worker; Phase 1 has no indicators (scaffold prepared here).

## SMA (Simple Moving Average)
- Formula: `SMA[t] = (close[t-n+1] + ... + close[t]) / n`
- Parameters: `period` (default 20)
- Initialization: first valid value at index `n-1`; earlier indices return `null`.
- Warm-up: `n-1` bars.

## EMA (Exponential Moving Average)
- Formula: `EMA[t] = close[t] * k + EMA[t-1] * (1 - k)`, where `k = 2 / (period + 1)`
- Seed: first EMA value = SMA at index `n-1` (common convention); earlier indices return `null`.
- Parameters: `period` (default 20)
- Warm-up: `n-1` bars for the seed.

## RSI (Relative Strength Index)
- Formula: `RSI = 100 - (100 / (1 + RS))`, `RS = avgGain / avgLoss`
- Wilder's smoothing (common): `avgGain[t] = ((avgGain[t-1] * (n-1)) + gain[t]) / n`, same for avgLoss.
- Seed: first avgGain/avgLoss computed as simple mean of first `n` changes; first RSI valid at index `n`.
- Parameters: `period` (default 14)
- Warm-up: `n` bars minimum; return `null` before that.
- Edge: if avgLoss == 0, RSI = 100 (strong up); if avgGain == 0, RSI = 0.

## MACD
- Components:
  - MACD line = EMA(close, fast) - EMA(close, slow)
  - Signal line = EMA(MACD line, signalPeriod)
  - Histogram = MACD line - Signal line
- Parameters: `fast` (default 12), `slow` (default 26), `signal` (default 9)
- Initialization: EMAs use their own warm-up; MACD first valid after the slower EMA is seeded.
- Warm-up: `slow-1` bars for the slow EMA seed; signal line adds its own warm-up on top.
- Return `null` where any component is not yet valid.

## Bollinger Bands
- Middle = SMA(close, period)
- Upper = Middle + (multiplier * stddev(close, period))
- Lower = Middle - (multiplier * stddev(close, period))
- Parameters: `period` (default 20), `multiplier` (default 2)
- Sample standard deviation over the window (population vs sample to be stated; use sample stddev, `n-1`).
- Return `null` before the window is filled.

## VWAP (Volume Weighted Average Price) — intraday only
- Formula: `VWAP = cumsum(typicalPrice * volume) / cumsum(volume)`, where `typicalPrice = (high + low + close) / 3`
- Reset at the start of each session (intraday only when valid).
- Not valid across session boundaries; returns `null` for out-of-session or when no volume.
- Parameters: none (session-based accumulation); optional anchored VWAP variant noted as future.
- Limitation: not meaningful for daily/weekly aggregates.

## Fixture tests
- Each indicator has a `tests/fixtures.ts` with known input OHLCV arrays and expected outputs at selected indices (including warm-up nulls).
- Fixtures are deterministic; no random data.
- "Insufficient history" asserted as `null`, never `0`.
