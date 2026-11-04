import { Decimal } from "decimal.js";
import { sma } from "./sma";

/**
 * Bollinger Bands.
 * Middle = SMA(close, period)
 * Upper = Middle + multiplier * stddev(close, period)
 * Lower = Middle - multiplier * stddev(close, period)
 * Uses sample stddev (n-1). Returns null before window is filled.
 */
export interface BollingerResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export function bollinger(close: number[], period = 20, multiplier = 2): BollingerResult {
  if (period < 2) throw new Error("period must be >= 2 for sample stddev");
  const middle = sma(close, period);
  const upper: (number | null)[] = new Array(close.length).fill(null);
  const lower: (number | null)[] = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    const window = close.slice(i - period + 1, i + 1);
    const m = middle[i];
    if (m == null) continue;
    const mean = new Decimal(m);
    let variance = new Decimal(0);
    for (const v of window) {
      variance = variance.plus(new Decimal(v).minus(mean).pow(2));
    }
    const stddev = variance.dividedBy(new Decimal(period).minus(1)).sqrt().toNumber();
    upper[i] = m + multiplier * stddev;
    lower[i] = m - multiplier * stddev;
  }
  return { middle, upper, lower };
}
