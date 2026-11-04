import { Decimal } from "decimal.js";
import { sma } from "./sma";

/**
 * Exponential Moving Average.
 * Seeds the first value from SMA, then applies smoothing.
 * Returns null for indices before the seed is available.
 */
export function ema(close: number[], period: number): (number | null)[] {
  if (period < 1) throw new Error("period must be >= 1");
  const out: (number | null)[] = new Array(close.length).fill(null);
  const k = new Decimal(2).dividedBy(new Decimal(period).plus(1));
  const seed = sma(close, period);
  let prev: Decimal | null = null;
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      // insufficient history
      continue;
    }
    if (i === period - 1) {
      prev = new Decimal(seed[i]!);
      out[i] = prev.toNumber();
      continue;
    }
    if (prev === null) continue;
    prev = new Decimal(close[i]!).times(k).plus(prev.times(new Decimal(1).minus(k)));
    out[i] = prev.toNumber();
  }
  return out;
}
