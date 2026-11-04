import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollinger, vwap, type CandleInput } from "../src";

// A deterministic price series so results are reproducible.
const CLOSE = [10, 10.5, 11, 10.8, 11.2, 11.6, 12, 12.1, 12.3, 12.2, 12.5, 12.8, 13, 13.2, 13.5, 13.4, 13.6, 13.9, 14, 14.2, 14.5, 14.3, 14.6, 14.9, 15];

describe("sma", () => {
  it("returns null before period is filled", () => {
    const period = 5;
    const out = sma(CLOSE, period);
    for (let i = 0; i < period - 1; i++) {
      expect(out[i]).toBeNull();
    }
  });

  it("gives a known value at the first valid index", () => {
    const period = 5;
    const out = sma(CLOSE, period);
    // first valid index = period - 1 = 4 -> average of first 5 closes: 10,10.5,11,10.8,11.2 = 10.7
    expect(out[4]).toBeCloseTo(10.7, 6);
  });
});

describe("ema", () => {
  it("returns null before seed is available", () => {
    const period = 5;
    const out = ema(CLOSE, period);
    for (let i = 0; i < period - 1; i++) {
      expect(out[i]).toBeNull();
    }
  });

  it("first valid equals sma at that index", () => {
    const period = 5;
    const e = ema(CLOSE, period);
    const s = sma(CLOSE, period);
    expect(e[period - 1]).toBeCloseTo(s[period - 1], 6);
  });
});

describe("rsi", () => {
  it("returns null before period of changes are available", () => {
    const period = 5;
    const out = rsi(CLOSE, period);
    for (let i = 0; i < period; i++) {
      expect(out[i]).toBeNull();
    }
  });

  it("does not return zero for a valid non-extreme series", () => {
    const period = 5;
    const out = rsi(CLOSE, period);
    expect(out[period]).not.toBeNull();
    expect(out[period]).not.toBe(0);
  });
});

describe("macd", () => {
  it("returns nulls until slow ema is seeded", () => {
    const { macd: macdLine } = macd(CLOSE, 12, 26, 9);
    for (let i = 0; i < 25; i++) {
      expect(macdLine[i]).toBeNull();
    }
  });

  it("histogram = macd - signal", () => {
    const { macd: macdLine, signal, histogram } = macd(CLOSE, 12, 26, 9);
    for (let i = 0; i < CLOSE.length; i++) {
      if (macdLine[i] == null || signal[i] == null || histogram[i] == null) continue;
      expect(histogram[i]).toBeCloseTo(macdLine[i] - signal[i], 9);
    }
  });
});

describe("bollinger", () => {
  it("returns null before window is filled", () => {
    const { upper, lower } = bollinger(CLOSE, 5, 2);
    for (let i = 0; i < 4; i++) {
      expect(upper[i]).toBeNull();
      expect(lower[i]).toBeNull();
    }
  });

  it("upper >= middle >= lower where valid", () => {
    const { middle, upper, lower } = bollinger(CLOSE, 5, 2);
    for (let i = 4; i < CLOSE.length; i++) {
      if (middle[i] == null || upper[i] == null || lower[i] == null) continue;
      expect(upper[i]).toBeGreaterThanOrEqual(middle[i]);
      expect(lower[i]).toBeLessThanOrEqual(middle[i]);
    }
  });
});

describe("vwap", () => {
  it("returns null when volume is zero", () => {
    const candles: CandleInput[] = [
      { time: 1, high: 10, low: 9, close: 9.5, volume: 0 },
      { time: 2, high: 11, low: 10, close: 10.5, volume: 100 },
    ];
    const sessions = ["s1", "s1"];
    const out = vwap(candles, sessions);
    expect(out[0]).toBeNull();
    expect(out[1]).not.toBeNull();
  });

  it("resets per session", () => {
    const candles: CandleInput[] = [
      { time: 1, high: 10, low: 9, close: 9.5, volume: 100 },
      { time: 2, high: 12, low: 11, close: 11.5, volume: 100 },
      { time: 3, high: 20, low: 19, close: 19.5, volume: 100 },
    ];
    const sessions = ["s1", "s1", "s2"];
    const out = vwap(candles, sessions);
    // First two in session s1: typical prices 9.5, 11.5; volumes 100,100
    // cumTPV = (9.5*100 + 11.5*100) = 2100; cumVol = 200 -> vwap = 10.5
    expect(out[1]).toBeCloseTo(10.5, 6);
    // After reset in s2, first vwap = typical price 19.5 (since only one bar with volume)
    expect(out[2]).toBeCloseTo(19.5, 6);
  });
});
