import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministic demo instruments + seeded price series
const INSTRUMENTS = [
  {
    internalTicker: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    assetType: "equity",
    currency: "USD",
    timezone: "America/New_York",
    pricePrecision: 2,
    provider: "demo",
  },
  {
    internalTicker: "MSFT",
    name: "Microsoft Corporation",
    exchange: "NASDAQ",
    assetType: "equity",
    currency: "USD",
    timezone: "America/New_York",
    pricePrecision: 2,
    provider: "demo",
  },
  {
    internalTicker: "GOOG",
    name: "Alphabet Inc.",
    exchange: "NASDAQ",
    assetType: "equity",
    currency: "USD",
    timezone: "America/New_York",
    pricePrecision: 2,
    provider: "demo",
  },
  {
    internalTicker: "TSLA",
    name: "Tesla, Inc.",
    exchange: "NASDAQ",
    assetType: "equity",
    currency: "USD",
    timezone: "America/New_York",
    pricePrecision: 2,
    provider: "demo",
  },
  {
    internalTicker: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    exchange: "NYSE Arca",
    assetType: "equity",
    currency: "USD",
    timezone: "America/New_York",
    pricePrecision: 2,
    provider: "demo",
  },
];

// A simple seeded random walk generator (deterministic)
function seededWalk(seed: number, steps: number, basePrice: number, volatility: number) {
  const out: number[] = [];
  let price = basePrice;
  let s = seed;
  // simple LCG
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

function buildCandles(
  instrumentId: string,
  closes: number[],
  baseVolume: number
) {
  const rows = [];
  // Build one daily candle per close; produce a plausible OHLC around the close
  closes.forEach((close, i) => {
    const variation = close * 0.02;
    const open = Number((close + (Math.sin(i * 1.3) * variation)).toFixed(2));
    const high = Number((Math.max(open, close) + variation * 0.5).toFixed(2));
    const low = Number((Math.min(open, close) - variation * 0.5).toFixed(2));
    const volume = Math.round(baseVolume * (0.5 + Math.sin(i * 0.7) * 0.5 + 0.5));
    // Daily timestamps moving backward from a fixed anchor for determinism
    const d = new Date("2024-01-02T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    rows.push({
      instrumentId,
      timeframe: "1D",
      session: "regular",
      open,
      high,
      low,
      close,
      volume: volume.toString(),
      timestamp: d.toISOString(),
      adjusted: false,
    });
  });
  return rows;
}

async function main() {
  console.log("Seeding demo instruments and candles...");

  for (const iv of INSTRUMENTS) {
    const instrument = await prisma.instrument.upsert({
      where: {
        u_instrument_identity: {
          internalTicker: iv.internalTicker,
          exchange: iv.exchange,
          provider: iv.provider,
        },
      },
      update: {},
      create: iv as any,
    });

    // AAPL ~190, MSFT ~370, GOOG ~140, TSLA ~240, SPY ~475
    const basePrices: Record<string, number> = {
      AAPL: 190,
      MSFT: 370,
      GOOG: 140,
      TSLA: 240,
      SPY: 475,
    };
    const baseVolume = 20_000_000;
    const closes = seededWalk(
      iv.internalTicker.length + iv.exchange.length,
      120,
      basePrices[iv.internalTicker] ?? 100,
      basePrices[iv.internalTicker] ? basePrices[iv.internalTicker] * 0.005 : 0.5
    );

    const candles = buildCandles(instrument.id, closes, baseVolume);
    await prisma.historicalCandle.createMany({
      data: candles,
      skipDuplicates: true,
    });

    // Create a latest quote snapshot from the last candle
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (last && prev) {
      const change = Number(last.close) - Number(prev.close);
      await prisma.latestQuote.upsert({
        where: { id: `${instrument.id}-1D` },
        update: {
          price: last.close,
          change: change.toString(),
          changePercent: ((change / Number(prev.close)) * 100).toString(),
          volume: last.volume,
          prevClose: prev.close,
          timestamp: last.timestamp,
          source: "demo",
          status: "demo",
        },
        create: {
          instrumentId: instrument.id,
          price: last.close,
          change: change.toString(),
          changePercent: ((change / Number(prev.close)) * 100).toString(),
          volume: last.volume,
          prevClose: prev.close,
          session: "regular",
          timestamp: last.timestamp,
          source: "demo",
          status: "demo",
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
