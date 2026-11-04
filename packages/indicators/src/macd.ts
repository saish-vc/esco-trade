import { Decimal } from "decimal.js";
import { ema } from "./ema";

/**
 * MACD line = EMA(fast) - EMA(slow)
 * Signal line = EMA(MACD line, signalPeriod)
 * Histogram = MACD line - Signal line
 * Returns null where any component is not yet valid.
 */
export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function macd(close: number[], fast = 12, slow = 26, signalPeriod = 9): MACDResult {
  if (fast < 1 || slow < 1 || signalPeriod < 1) throw new Error("periods must be >= 1");
  if (fast >= slow) throw new Error("fast must be < slow");
  const fastEMA = ema(close, fast);
  const slowEMA = ema(close, slow);
  const macdLine: (number | null)[] = new Array(close.length).fill(null);
  for (let i = 0; i < close.length; i++) {
    const fe = fastEMA[i];
    const se = slowEMA[i];
    if (fe == null || se == null) continue;
    macdLine[i] = fe - se;
  }
  // Signal = EMA of macdLine
  const macdValues = macdLine.map((v) => (v == null ? 0 : v));
  const signalEma = ema(macdValues, signalPeriod);
  const signal: (number | null)[] = new Array(close.length).fill(null);
  const histogram: (number | null)[] = new Array(close.length).fill(null);
  for (let i = 0; i < close.length; i++) {
    const m = macdLine[i];
    const s = signalEma[i];
    if (m == null || s == null) continue;
    // signalEma could be null if the macd series hasn't filled its warm-up
    if (s === null) continue;
    signal[i] = s;
    histogram[i] = m - s;
  }
  return { macd: macdLine, signal, histogram };
}
