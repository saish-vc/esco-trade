import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
// Import types from marketdata module
// Types are defined locally for now

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoricalResponse {
  candles: CandleData[];
  symbol: string;
  timeframe: string;
}

export class MarketDataService {
  private redis: Redis;
  private prisma: PrismaClient;
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private readonly GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes gap

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  async getHistoricalCandles(
    instrumentId: string,
    timeframe: string,
    session: string,
    adjustment: string
  ): Promise<HistoricalResponse> {
    // Generate cache key
    const cacheKey = this.getCacheKey(instrumentId, timeframe, session, adjustment);
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as HistoricalResponse;
    }

    // Fetch from provider (mock for now - in production would call Alpha Vantage)
    const response = await this.fetchHistorical(instrumentId, timeframe, session, adjustment);
    
    // Cache the result
    await this.redis.setex(cacheKey, this.CACHE_TTL_SECONDS, JSON.stringify(response));
    
    return response;
  }

  async getRealTimeQuote(instrumentId: string): Promise<{
    price: number;
    change?: number;
    changePercent?: number;
    volume?: number;
    prevClose?: number;
    session: string;
    timestamp: number;
    source: string;
    status: "live" | "delayed" | "demo";
  } | null> {
    const quote = await this.prisma.latestQuote.findFirst({
      where: { instrumentId: instrumentId },
    });

    if (!quote) return null;

    return {
      price: Number(quote.price ?? 0),
      change: quote.change ? Number(quote.change) : undefined,
      changePercent: quote.changePercent ? Number(quote.changePercent) : undefined,
      volume: quote.volume ? Number(quote.volume) : undefined,
      prevClose: quote.prevClose ? Number(quote.prevClose) : undefined,
      session: quote.session ?? "regular",
      timestamp: quote.timestamp?.getTime() ?? 0,
      source: quote.source ?? "demo",
      status: (quote.status ?? "demo") as "live" | "delayed" | "demo",
    };
  }

  getCacheKey(instrumentId: string, timeframe: string, session: string, adjustment: string): string {
    return `marketdata:${instrumentId}:${timeframe}:${session}:${adjustment}`;
  }

  // Detect gaps in candle data
  detectGaps(candles: CandleData[], expectedIntervalMs: number): { hasGap: boolean; gapStart?: number; gapEnd?: number } {
    if (candles.length < 2) {
      return { hasGap: false };
    }

    for (let i = 1; i < candles.length; i++) {
      const prevCandle = candles[i - 1]!;
      const currCandle = candles[i]!;
      const expectedTime = prevCandle.timestamp + expectedIntervalMs;
      const actualTime = currCandle.timestamp;
      
      if (actualTime - expectedTime > this.GAP_THRESHOLD_MS) {
        return {
          hasGap: true,
          gapStart: prevCandle.timestamp,
          gapEnd: currCandle.timestamp,
        };
      }
    }

    return { hasGap: false };
  }

  // Backfill missing candles
  async backfillCandles(
    instrumentId: string,
    timeframe: string,
    session: string,
    adjustment: string,
    from: number,
    to: number
  ): Promise<CandleData[]> {
    // In production, this would call the provider API
    // For now, return empty array
    return [];
  }

  private async fetchHistorical(
    instrumentId: string,
    timeframe: string,
    session: string,
    adjustment: string
  ): Promise<HistoricalResponse> {
    // Try to get from database first
    const rawCandles = await this.prisma.historicalCandle.findMany({
      where: {
        instrumentId,
        timeframe,
        session,
        adjusted: adjustment === "adjusted" ? true : false,
      },
      orderBy: { timestamp: "asc" },
      take: 500,
    });
    if (rawCandles.length === 0) {
      return {
        candles: this.generateDemoCandles(timeframe),
        symbol: "DEMO",
        timeframe,
      } as HistoricalResponse;
    }
    const candles = rawCandles.map((c: any) => ({
      timestamp: c.timestamp.getTime(),
      open: Number(c.open ?? 0),
      high: Number(c.high ?? 0),
      low: Number(c.low ?? 0),
      close: Number(c.close ?? 0),
      volume: Number(c.volume ?? 0),
    })) as CandleData[];
    return {
      candles,
      symbol: await this.getSymbolForInstrument(instrumentId),
      timeframe,
    } as HistoricalResponse;
  }

  private async getSymbolForInstrument(instrumentId: string): Promise<string> {
    const instrument = await this.prisma.instrument.findUnique({
      where: { id: instrumentId },
      select: { internalTicker: true },
    });
    return instrument?.internalTicker ?? "UNKNOWN";
  }

  private generateDemoCandles(timeframe: string, count: number = 100): CandleData[] {
    const now = Math.floor(Date.now() / 1000);
    const interval = this.getIntervalForTimeframe(timeframe);
    const candles: CandleData[] = [];

    let price = 150 + Math.random() * 100;
    let time = now - (count * interval);

    for (let i = 0; i < count; i++) {
      const open = price;
      const change = (Math.random() - 0.5) * 4;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      const volume = Math.floor(1000000 + Math.random() * 5000000);

      candles.push({
        timestamp: time,
        open,
        high,
        low,
        close,
        volume,
      });

      price = close;
      time += interval;
    }

    return candles;
  }

  private getIntervalForTimeframe(timeframe: string): number {
    switch (timeframe) {
      case "1m": return 60;
      case "5m": return 300;
      case "15m": return 900;
      case "1h": return 3600;
      case "4h": return 14400;
      case "1D": return 86400;
      case "1W": return 604800;
      case "1M": return 2592000;
      default: return 86400;
    }
  }
}
