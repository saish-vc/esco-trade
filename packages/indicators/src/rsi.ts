import { Decimal } from "decimal.js";

/**
 * Relative Strength Index using Wilder's smoothing.
 * First valid at index `period` (needs period + 1 closing prices to compute first change average).
 * Returns null before that.
 */
export function rsi(close: number[], period: number): (number | null)[] {
  if (period < 1) throw new Error("period must be >= 1");
  const out: (number | null)[] = new Array(close.length).fill(null);
  if (close.length < period + 1) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < close.length; i++) {
    const diff = close[i]! - close[i - 1]!;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }
  // Initial simple averages over first `period` changes
  let avgGain = new Decimal(0);
  let avgLoss = new Decimal(0);
  for (let i = 0; i < period; i++) {
    avgGain = avgGain.plus(gains[i]!);
    avgLoss = avgLoss.plus(losses[i]!);
  }
  avgGain = avgGain.dividedBy(period);
  avgLoss = avgLoss.dividedBy(period);

  const idxOfFirstRsi = period; // after period changes, i.e. close[period] is first RSI index
  for (let i = idxOfFirstRsi; i < close.length; i++) {
    if (i === idxOfFirstRsi) {
      // Use the initial averages directly
    } else {
      const g = gains[i - 1]!;
      const l = losses[i - 1]!;
      avgGain = avgGain.times(new Decimal(period).minus(1)).plus(new Decimal(g as number)).dividedBy(period);
      avgLoss = avgLoss.times(new Decimal(period).minus(1)).plus(new Decimal(l as number)).dividedBy(period);
    }
    let rsiVal: number;
    if (avgLoss.equals(0)) {
      rsiVal = 100;
    } else {
      const rs = avgGain.dividedBy(avgLoss);
      rsiVal = new Decimal(100).minus(new Decimal(100).dividedBy(new Decimal(1).plus(rs))).toNumber();
    }
    out[i] = rsiVal;
  }
  return out;
}
