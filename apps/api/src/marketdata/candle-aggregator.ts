import type { MarketDataEvent } from "@esco-trade/shared";

export interface AggregateCandle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isComplete: boolean;
}

export class CandleAggregator {
  // Map of `symbol:timeframeSeconds` -> currently building Candle
  private activeCandles: Map<string, AggregateCandle> = new Map();

  /**
   * Translates timeframe string like "1m", "5m", "15m", "1h", "1D" to seconds
   */
  public static timeframeToSeconds(timeframe: string): number {
    switch (timeframe) {
      case "1m": return 60;
      case "5m": return 300;
      case "15m": return 900;
      case "1h": return 3600;
      case "4h": return 14400;
      case "1D": return 86400;
      case "1W": return 604800;
      case "1M": return 2592000;
      default: return 60;
    }
  }

  /**
   * Aligns a timestamp (in ms) to the floor bucket boundary in seconds
   */
  public static getBucketBoundary(timestampMs: number, intervalSec: number): number {
    const sec = Math.floor(timestampMs / 1000);
    return Math.floor(sec / intervalSec) * intervalSec;
  }

  /**
   * Ingests a trade/quote event and returns an updated candle.
   * If a timeframe boundary is crossed, marks the previous candle as complete and starts a new one.
   */
  public processTick(
    symbol: string,
    timeframe: string,
    price: number,
    volume: number,
    timestampMs: number
  ): { current: AggregateCandle; completed?: AggregateCandle } {
    const intervalSec = CandleAggregator.timeframeToSeconds(timeframe);
    const bucketTime = CandleAggregator.getBucketBoundary(timestampMs, intervalSec);
    const key = `${symbol}:${timeframe}`;

    const existing = this.activeCandles.get(key);

    if (!existing) {
      const initial: AggregateCandle = {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume || 0,
        isComplete: false,
      };
      this.activeCandles.set(key, initial);
      return { current: initial };
    }

    // Check if tick belongs to a new candle bucket
    if (bucketTime > existing.time) {
      const completed: AggregateCandle = {
        ...existing,
        isComplete: true,
      };

      const nextCandle: AggregateCandle = {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume || 0,
        isComplete: false,
      };

      this.activeCandles.set(key, nextCandle);
      return { current: nextCandle, completed };
    }

    // Tick belongs to current bucket
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += (volume || 0);

    return { current: existing };
  }

  public getActiveCandle(symbol: string, timeframe: string): AggregateCandle | undefined {
    return this.activeCandles.get(`${symbol}:${timeframe}`);
  }

  public clear(): void {
    this.activeCandles.clear();
  }
}
