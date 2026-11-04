import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MarketDataGateway } from "../src/marketdata/gateway";
import { CandleAggregator } from "../src/marketdata/candle-aggregator";
import type { MarketDataEvent } from "@esco-trade/shared";

describe("Market Data Gateway — Abstraction & Aggregation Tests", () => {
  let gateway: MarketDataGateway;

  beforeEach(() => {
    gateway = new MarketDataGateway({
      providerType: "demo",
      batchMs: 10,
    });
  });

  afterEach(async () => {
    await gateway.stop();
  });

  describe("Subscription Deduplication & Reference Counting", () => {
    it("increments refCount on multi-user subscriptions without duplicating upstream", async () => {
      await gateway.start();

      // User A subscribes to AAPL
      const subA = await gateway.subscribe("user-1", "inst-aapl", "AAPL");
      expect(subA.success).toBe(true);
      expect(gateway.getRefCount("inst-aapl")).toBe(1);

      // User B subscribes to the SAME instrument
      const subB = await gateway.subscribe("user-2", "inst-aapl", "AAPL");
      expect(subB.success).toBe(true);
      expect(gateway.getRefCount("inst-aapl")).toBe(2);

      // Active upstream unique symbols is still 1
      expect(gateway.getActiveSubscriptionsCount()).toBe(1);

      // User A unsubscribes -> refCount drops to 1, still active
      await gateway.unsubscribe("user-1", "inst-aapl");
      expect(gateway.getRefCount("inst-aapl")).toBe(1);
      expect(gateway.getActiveSubscriptionsCount()).toBe(1);

      // User B unsubscribes -> refCount drops to 0, completely removed
      await gateway.unsubscribe("user-2", "inst-aapl");
      expect(gateway.getRefCount("inst-aapl")).toBe(0);
      expect(gateway.getActiveSubscriptionsCount()).toBe(0);
    });

    it("enforces provider symbol limit when exceeded", async () => {
      const smallGateway = new MarketDataGateway({
        providerType: "polling", // Polling adapter limit is 10
      });
      await smallGateway.start();

      // Subscribe 10 unique symbols
      for (let i = 0; i < 10; i++) {
        const res = await smallGateway.subscribe("user-1", `inst-${i}`, `SYM${i}`);
        expect(res.success).toBe(true);
      }

      // 11th symbol should be rejected with clear reason
      const overflowRes = await smallGateway.subscribe("user-1", "inst-overflow", "OVERFLOW");
      expect(overflowRes.success).toBe(false);
      expect(overflowRes.reason).toContain("PROVIDER_LIMIT_REACHED");

      await smallGateway.stop();
    });
  });

  describe("Candle Aggregator", () => {
    it("aggregates ticks into high, low, open, close, and volume", () => {
      const aggregator = new CandleAggregator();
      const baseTimeMs = 1704067200000; // 2024-01-01 00:00:00 UTC

      // Tick 1: open
      const t1 = aggregator.processTick("AAPL", "1m", 150.0, 100, baseTimeMs + 5000);
      expect(t1.current.open).toBe(150.0);
      expect(t1.current.high).toBe(150.0);
      expect(t1.current.low).toBe(150.0);
      expect(t1.current.close).toBe(150.0);
      expect(t1.current.volume).toBe(100);
      expect(t1.completed).toBeUndefined();

      // Tick 2: higher
      const t2 = aggregator.processTick("AAPL", "1m", 155.0, 50, baseTimeMs + 10000);
      expect(t2.current.open).toBe(150.0);
      expect(t2.current.high).toBe(155.0);
      expect(t2.current.low).toBe(150.0);
      expect(t2.current.close).toBe(155.0);
      expect(t2.current.volume).toBe(150);

      // Tick 3: lower
      const t3 = aggregator.processTick("AAPL", "1m", 148.0, 200, baseTimeMs + 25000);
      expect(t3.current.high).toBe(155.0);
      expect(t3.current.low).toBe(148.0);
      expect(t3.current.close).toBe(148.0);
      expect(t3.current.volume).toBe(350);

      // Tick 4: crossing into next minute (65 seconds later)
      const t4 = aggregator.processTick("AAPL", "1m", 152.0, 80, baseTimeMs + 65000);
      expect(t4.completed).toBeDefined();
      expect(t4.completed?.isComplete).toBe(true);
      expect(t4.completed?.close).toBe(148.0);
      expect(t4.completed?.volume).toBe(350);

      expect(t4.current.open).toBe(152.0);
      expect(t4.current.close).toBe(152.0);
      expect(t4.current.volume).toBe(80);
    });
  });

  describe("Event Normalization & Batching", () => {
    it("flushes batched market data events", async () => {
      let receivedBatches: MarketDataEvent[][] = [];
      gateway.onBatch((batch) => {
        receivedBatches.push(batch);
      });

      await gateway.start();
      await gateway.subscribe("user-1", "inst-1", "AAPL");

      // Wait for demo ticks to produce and batch
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(receivedBatches.length).toBeGreaterThan(0);
      const firstEvent = receivedBatches[0][0];
      expect(firstEvent.type).toBe("trade");
      expect(firstEvent.source).toBe("demo");
      expect(firstEvent.classification).toBe("simulated");
      expect(firstEvent.candle).toBeDefined();
      expect(firstEvent.candle?.open).toBeTypeOf("number");
    });
  });
});
