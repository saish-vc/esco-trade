import { describe, it, expect } from "vitest";
import { CreateInstrumentSchema, InstrumentSchema, QuoteSchema, HistoricalSchema, CandleSchema } from "../src/instruments";
import { CreateWatchlistSchema, AddWatchlistItemSchema } from "../src/watchlists";
import { CreateLayoutSchema } from "../src/layouts";

describe("shared schemas", () => {
  it("CreateInstrumentSchema accepts valid data", () => {
    const data = CreateInstrumentSchema.parse({
      internalTicker: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      provider: "demo",
    });
    expect(data.internalTicker).toBe("AAPL");
  });

  it("CreateInstrumentSchema rejects empty ticker", () => {
    expect(() => CreateInstrumentSchema.parse({ internalTicker: "", name: "x" })).toThrow();
  });

  it("InstrumentSchema shape", () => {
    const value = InstrumentSchema.shape;
    expect(value.id).toBeDefined();
    expect(value.internalTicker).toBeDefined();
  });

  it("QuoteSchema shape", () => {
    const parsed = QuoteSchema.parse({
      instrumentId: "c0a80121-0d4e-4b9b-8f1a-0c7d7e6b2a1f",
      price: 150.25,
      change: 1.0,
      changePercent: 0.67,
      volume: 10_000_000,
      prevClose: 149.25,
      session: "regular",
      timestamp: new Date(),
      source: "demo",
      status: "demo",
    });
    expect(parsed.price).toBe(150.25);
    expect(parsed.source).toBe("demo");
  });

  it("CandleSchema", () => {
    const parsed = CandleSchema.parse({
      timestamp: new Date(),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1_000_000,
      adjusted: false,
    });
    expect(parsed.high).toBeGreaterThanOrEqual(parsed.low);
  });

  it("CreateWatchlistSchema", () => {
    const parsed = CreateWatchlistSchema.parse({ name: "My list" });
    expect(parsed.name).toBe("My list");
    expect(() => CreateWatchlistSchema.parse({ name: "" })).toThrow();
  });

  it("AddWatchlistItemSchema", () => {
    const parsed = AddWatchlistItemSchema.parse({
      watchlistId: "c0a80121-0d4e-4b9b-8f1a-0c7d7e6b2a1f",
      instrumentId: "c0a80121-0d4e-4b9b-8f1a-0c7d7e6b2a1f",
    });
    expect(parsed.watchlistId).toBeDefined();
  });

  it("CreateLayoutSchema", () => {
    const parsed = CreateLayoutSchema.parse({
      name: "My layout",
      instrumentId: "c0a80121-0d4e-4b9b-8f1a-0c7d7e6b2a1f",
      timeframe: "1D",
      chartType: "candlestick",
      scale: "linear",
      drawings: [],
      preferences: {},
    });
    expect(parsed.chartType).toBe("candlestick");
  });
});
