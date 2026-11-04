import { Decimal } from "decimal.js";

/**
 * VWAP (Volume Weighted Average Price), intraday, session-reset.
 * typicalPrice = (high + low + close) / 3
 * VWAP = cumsum(typicalPrice * volume) / cumsum(volume)
 * Returns null when volume is zero or for out-of-session windows.
 *
 * Session input: an array of session boundaries (inclusive start timestamps).
 * candles: [{time, high, low, close, volume}] aligned by index to session array
 * where session[i] is the session id for candle[i].
 */
export interface CandleInput {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function vwap(candles: CandleInput[], sessionIds: (string | number)[]): (number | null)[] {
  if (candles.length !== sessionIds.length) throw new Error("candles and sessionIds must align");
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let cumTPV = new Decimal(0);
  let cumVol = new Decimal(0);
  let currentSession: string | number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const sid: string | number | null = sessionIds[i] ?? currentSession;
    // Reset on session change
    if (currentSession !== sid) {
      cumTPV = new Decimal(0);
      cumVol = new Decimal(0);
      currentSession = sid;
    }
    if (c.volume <= 0) continue;
    const typicalPrice = new Decimal(c.high).plus(c.low).plus(c.close).dividedBy(3);
    cumTPV = cumTPV.plus(typicalPrice.times(new Decimal(c.volume)));
    cumVol = cumVol.plus(new Decimal(c.volume));
    if (cumVol.greaterThan(0)) {
      out[i] = cumTPV.dividedBy(cumVol).toNumber();
    }
  }
  return out;
}
