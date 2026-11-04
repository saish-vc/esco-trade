import { FastifyInstance } from "fastify";
import { marketdataPlugin } from "../src/modules/marketdata";
import { beforeEach, describe, it, expect } from "vitest";

describe("marketdata module", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    const f = (await import("fastify")).default();
    const { schemas } = await import("../src/schemas");
    for (const schema of schemas) {
      f.addSchema(schema);
    }
    fastify = f;
    await fastify.register(marketdataPlugin, { prefix: "/api/v1" });
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  it("returns 404 for unknown instrument id", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/api/v1/instruments/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeDefined();
  });

  it("returns empty search for empty query", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/api/v1/instruments?q=&limit=50",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.instruments)).toBe(true);
  });

  it("returns search results for a ticker substring", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/api/v1/instruments?q=AAPL&limit=50",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.instruments)).toBe(true);
    if (body.instruments.length > 0) {
      expect(body.instruments[0].internalTicker).toBeDefined();
    }
  });

  it("historical candles return demo data with status demo", async () => {
    // First find an instrument id to use
    const searchRes = await fastify.inject({ method: "GET", url: "/api/v1/instruments?q=AAPL&limit=1" });
    const { instruments } = JSON.parse(searchRes.payload) as { instruments: { id: string }[] };
    if (instruments.length === 0) {
      throw new Error("No instrument available for candle test (seed may not have run). Skipping.");
    }
    const instrumentId = instruments[0].id;
    const from = new Date("2024-01-01T00:00:00Z").toISOString();
    const to = new Date("2024-02-01T00:00:00Z").toISOString();
    const res = await fastify.inject({
      method: "GET",
      url: `/api/v1/instruments/${instrumentId}/candles?instrumentId=${instrumentId}&timeframe=1D&from=${from}&to=${to}&session=regular`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { candles: unknown[]; status: string; source: string };
    expect(Array.isArray(body.candles)).toBe(true);
    expect(body.status).toBe("demo");
    expect(body.source).toBe("demo");
    if (body.candles.length > 0) {
      const c = body.candles[0] as { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
      expect(c.timestamp).toBeDefined();
      expect(c.open).toBeTypeOf("number");
      expect(c.high).toBeGreaterThanOrEqual(c.low);
    }
  });

  it("latest quote returns demo status", async () => {
    const searchRes = await fastify.inject({ method: "GET", url: "/api/v1/instruments?q=MSFT&limit=1" });
    const { instruments } = JSON.parse(searchRes.payload) as { instruments: { id: string }[] };
    if (instruments.length === 0) throw new Error("No instrument for quote test; skipping.");
    const res = await fastify.inject({
      method: "GET",
      url: `/api/v1/instruments/${instruments[0].id}/quote`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { price: number; source: string; status: string };
    expect(body.price).toBeTypeOf("number");
    expect(body.source).toBe("demo");
    expect(body.status).toBe("demo");
  });

  it("invalid date range returns 400", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/api/v1/instruments/some-id/candles?instrumentId=some-id&timeframe=1D&from=not-a-date&to=not-a-date",
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeDefined();
  });
});
