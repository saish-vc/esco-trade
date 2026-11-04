import { Decimal } from "decimal.js";

/**
 * Simple Moving Average.
 * Returns null for indices before the period is filled (insufficient history).
 */
export function sma(close: number[], period: number): (number | null)[] {
  if (period < 1) throw new Error("period must be >= 1");
  const out: (number | null)[] = new Array(close.length).fill(null);
  let sum = new Decimal(0);
  for (let i = 0; i < close.length; i++) {
    sum = sum.plus(close[i]!);
    if (i >= period) {
      sum = sum.minus(close[i - period]!);
    }
    if (i >= period - 1) {
      out[i] = sum.dividedBy(period).toNumber();
    }
  }
  return out;
}
