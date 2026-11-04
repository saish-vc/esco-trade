import { FastifyPluginCallback } from "fastify";
import { prisma } from "../db/client";
import {
  Instrument,
  Quote,
  Historical,
  Candle,
  CreateInstrumentInput,
} from "@esco-trade/shared";
import { CreateInstrumentSchema, HistoricalRangeSchema } from "@esco-trade/shared";
// Prisma query helpers (eq, and, gte, lte, desc) are from @prisma/client extensions.
// For now we only use the PrismaClient directly; no need for these helpers in the demo adapter.

// ---- Demo adapter: deterministic seeded series ----
export interface MarketDataProvider {
  search(query: string): Promise<Instrument[]>;
  metadata(id: string): Promise<Instrument | null>;
  historical(range: {
    instrumentId: string;
    timeframe: string;
    from: Date;
    to: Date;
    session?: string;
  }): Promise<Historical>;
  latestQuote(instrumentId: string): Promise<Quote | null>;
}

// Deterministic price generator (same as seed logic)
function seededWalk(seed: number, steps: number, basePrice: number, volatility: number): number[] {
  const out: number[] = [];
  let price = basePrice;
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < steps; i++) {
    const change = (next() - 0.5) * 2 * volatility;
    price = Math.max(price + change, basePrice * 0.5);
    out.push(Number(price.toFixed(2)));
  }
  return out;
}

function demoCandlesForInstrument(instrument: Instrument, range: { from: Date; to: Date; timeframe: string }): Candle[] {
  // For demo, we produce one candle per calendar day between from and to regardless of timeframe,
  // since demo is uniform across timeframes for Phase 1. Real adapter uses actual requested timeframe.
  const seed = (instrument.internalTicker.length + (instrument.exchange?.length ?? 0)) * 7 + 1;
  const basePrices: Record<string, number> = {
    AAPL: 190, MSFT: 370, GOOG: 140, TSLA: 240, SPY: 475,
  };
  const basePrice = basePrices[instrument.internalTicker] ?? 100;
  const volatility = basePrice * 0.005;
  const count = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1);
  const closes = seededWalk(seed, count, basePrice, volatility);
  const candles: Candle[] = [];
  const start = new Date(range.from);
  for (let i = 0; i < closes.length; i++) {
    const close = closes[i]!;
    const variation = close * 0.02;
    const open = Number((close + Math.sin(i * 1.3) * variation).toFixed(2));
    const high = Number((Math.max(open, close) + variation * 0.5).toFixed(2));
    const low = Number((Math.min(open, close) - variation * 0.5).toFixed(2));
    const volume = Math.round(20000000 * (0.5 + Math.sin(i * 0.7) * 0.5 + 0.5));
    const t = new Date(start);
    t.setUTCDate(t.getUTCDate() + i);
    t.setUTCHours(0, 0, 0, 0);
    candles.push({ timestamp: t, open, high, low, close, volume, adjusted: false });
  }
  return candles;
}

const demoProvider: MarketDataProvider = {
  async search(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rows = await prisma.instrument.findMany({
      where: {
        OR: [
          { internalTicker: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { internalTicker: "asc" },
    });
    return rows as unknown as Instrument[];
  },

  async metadata(id) {
    const row = await prisma.instrument.findUnique({ where: { id } });
    return row as unknown as Instrument | null;
  },

  async historical(range) {
    const instrument = await prisma.instrument.findUnique({ where: { id: range.instrumentId } });
    if (!instrument) {
      throw new Error(`Instrument not found: ${range.instrumentId}`);
    }
    // If we have cached candles in range, prefer them; else generate demo on the fly.
    const candles: Candle[] = demoCandlesForInstrument(
      instrument as unknown as Instrument,
      { from: range.from, to: range.to, timeframe: range.timeframe }
    );
    // Translate candles to Decimal-tolerant DB rows only if we want to persist; for demo read we return in-memory.
    const last = candles[candles.length - 1];
    const source = "demo";
    const status = "demo";
    return {
      instrumentId: range.instrumentId,
      timeframe: range.timeframe,
      session: range.session ?? "regular",
      candles,
      source,
      status,
      latestObservationTime: last ? last.timestamp : undefined,
    };
  },

  async latestQuote(instrumentId) {
    // First try cached latest quote
    let row = await prisma.latestQuote.findFirst({
      where: { instrumentId },
      orderBy: { timestamp: "desc" },
    });
    if (!row) {
      // Build one from the latest demo candle
      const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
      if (!instrument) return null;
      const candles = demoCandlesForInstrument(
        instrument as unknown as Instrument,
        { from: new Date(0), to: new Date(), timeframe: "1D" }
      );
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      if (!last) return null;
      const price = last.close;
      const change = prev && prev.close != null ? last.close - prev.close : 0;
      row = await prisma.latestQuote.create({
        data: {
          instrumentId,
          price: last.close,
          change: price - (prev?.close ?? last.close),
          changePercent: prev ? ((change / prev.close) * 100) : 0,
          volume: last.volume,
          prevClose: prev?.close ?? last.close,
          session: "regular",
          timestamp: last.timestamp,
          source: "demo",
          status: "demo",
        },
      });
    }
    return {
      instrumentId: row.instrumentId,
      price: Number(row.price),
      change: row.change ? Number(row.change) : undefined,
      changePercent: row.changePercent ? Number(row.changePercent) : undefined,
      volume: row.volume ? Number(row.volume) : undefined,
      prevClose: row.prevClose ? Number(row.prevClose) : undefined,
      session: row.session,
      timestamp: row.timestamp,
      source: row.source,
      status: row.status,
    };
  },
};

export const marketdataPlugin: FastifyPluginCallback = async (fastify, opts) => {
  // Search
  fastify.get<{
    Querystring: { q?: string; limit?: number; cursor?: string };
  }>("/instruments", {
    schema: {
      tags: ["marketdata"],
      summary: "Search instruments (demo; real adapter disabled for public redistribution until verified)",
      querystring: {
        type: "object",
        properties: {
          q: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          cursor: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            instruments: { type: "array", items: { $ref: "Instrument#" } },
            nextCursor: { type: "string" },
          },
        },
      },
    },
  }, async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const instruments = await demoProvider.search(q).then((list) => list.slice(0, limit));
    return {
      instruments: instruments as unknown as import("@esco-trade/shared").Instrument[],
      nextCursor: undefined,
    };
  });

  // Metadata
  fastify.get<{ Params: { id: string } }>("/instruments/:id", {
    schema: {
      tags: ["marketdata"],
      summary: "Get instrument metadata",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 200: { $ref: "Instrument#" } },
    },
  }, async (req, reply) => {
    const meta = await demoProvider.metadata(req.params.id);
    if (!meta) return reply.code(404).send({ error: "Instrument not found" });
    return meta as unknown as import("@esco-trade/shared").Instrument;
  });

  // Historical candles
  fastify.get<{
    Querystring: {
      instrumentId: string;
      timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";
      from: string;
      to: string;
      session?: string;
    };
  }>("/instruments/:instrumentId/candles", {
    schema: {
      tags: ["marketdata"],
      summary: "Historical OHLCV candles",
      querystring: {
        type: "object",
        required: ["instrumentId", "timeframe", "from", "to"],
        properties: {
          instrumentId: { type: "string", format: "uuid" },
          timeframe: {
            type: "string",
            enum: ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"],
          },
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          session: { type: "string" },
        },
      },
      response: { 200: { $ref: "Historical#" } },
    },
  }, async (req, reply) => {
    const instrumentId = req.query.instrumentId;
    const timeframe = req.query.timeframe;
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return reply.code(400).send({ error: "Invalid date range" });
    }
    const result = await demoProvider.historical({
      instrumentId,
      timeframe,
      from,
      to,
      session: req.query.session,
    });
    return result as unknown as import("@esco-trade/shared").Historical;
  });

  // Latest quote
  fastify.get<{ Params: { instrumentId: string } }>("/instruments/:instrumentId/quote", {
    schema: {
      tags: ["marketdata"],
      summary: "Latest quote (cached; demo by default)",
      params: { type: "object", properties: { instrumentId: { type: "string", format: "uuid" } } },
      response: { 200: { $ref: "Quote#" } },
    },
  }, async (req, reply) => {
    const quote = await demoProvider.latestQuote(req.params.instrumentId);
    if (!quote) return reply.code(404).send({ error: "Instrument or quote not found" });
    return quote as unknown as import("@esco-trade/shared").Quote;
  });

  // (Admin-ish) create instrument — used by seed/admin only; not exposed publicly.
  fastify.post<{ Body: CreateInstrumentInput }>("/instruments", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["marketdata"],
      summary: "Create an instrument (internal/admin)",
      body: { $ref: "CreateInstrument#" },
      response: { 201: { $ref: "Instrument#" } },
    },
  }, async (req, reply) => {
    const input = CreateInstrumentSchema.parse(req.body);
    const created = await prisma.instrument.create({ data: input as any });
    return reply.code(201).send(created as unknown as import("@esco-trade/shared").Instrument);
  });
};

export { demoProvider };
