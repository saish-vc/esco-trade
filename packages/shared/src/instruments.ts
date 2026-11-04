import { z } from "zod";

export const CreateInstrumentSchema = z.object({
  internalTicker: z.string().min(1),
  name: z.string().optional(),
  assetType: z.string().optional().default("equity"),
  exchange: z.string().optional(),
  currency: z.string().optional().default("USD"),
  timezone: z.string().optional().default("America/New_York"),
  pricePrecision: z.number().int().optional().default(2),
  providerId: z.string().optional(),
  provider: z.string().optional(),
  session: z.string().optional().default("regular"),
});

export type CreateInstrumentInput = z.infer<typeof CreateInstrumentSchema>;

export const InstrumentSchema = CreateInstrumentSchema.extend({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Instrument = z.infer<typeof InstrumentSchema>;

export const InstrumentSearchResultSchema = z.object({
  instruments: z.array(InstrumentSchema),
  continuationToken: z.string().optional(),
});

export type InstrumentSearchResult = z.infer<typeof InstrumentSearchResultSchema>;

export const InstrumentByIdSchema = InstrumentSchema;

export const QuoteSchema = z.object({
  instrumentId: z.string().uuid(),
  price: z.number(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  volume: z.number().optional(),
  prevClose: z.number().optional(),
  session: z.string().optional(),
  timestamp: z.date(),
  source: z.enum(["demo", "alphavantage"]).or(z.string()),
  status: z.enum(["live", "delayed", "demo", "stale"]).or(z.string()),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const HistoricalRangeSchema = z.object({
  instrumentId: z.string().uuid(),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"]),
  from: z.date(),
  to: z.date(),
  session: z.string().optional().default("regular"),
});

export type HistoricalRangeInput = z.infer<typeof HistoricalRangeSchema>;

export const CandleSchema = z.object({
  timestamp: z.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  adjusted: z.boolean().optional().default(false),
});

export type Candle = z.infer<typeof CandleSchema>;

export const HistoricalSchema = z.object({
  instrumentId: z.string().uuid(),
  timeframe: z.string(),
  session: z.string().optional(),
  candles: z.array(CandleSchema),
  source: z.string(),
  status: z.enum(["live", "delayed", "demo", "stale"]).or(z.string()),
  latestObservationTime: z.date().optional(),
});

export type Historical = z.infer<typeof HistoricalSchema>;

export const OHLCVTooltipSchema = z.object({
  time: z.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export type OHLCVTooltip = z.infer<typeof OHLCVTooltipSchema>;
