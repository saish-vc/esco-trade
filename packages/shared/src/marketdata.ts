import { z } from "zod";

export const DataClassificationSchema = z.enum(["live", "delayed", "simulated", "stale", "missing"]);
export type DataClassification = z.infer<typeof DataClassificationSchema>;

export const MarketEventTypeSchema = z.enum(["quote", "trade", "candle", "status", "error"]);
export type MarketEventType = z.infer<typeof MarketEventTypeSchema>;

export const ProviderTypeSchema = z.enum(["demo", "finnhub", "alpaca", "polling"]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const MarketDataEventSchema = z.object({
  id: z.string().optional(),
  instrumentId: z.string(),
  providerSymbol: z.string(),
  exchange: z.string().optional(),
  type: MarketEventTypeSchema,
  price: z.number(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  bidSize: z.number().optional(),
  askSize: z.number().optional(),
  volume: z.number().optional(),
  timestamp: z.number(), // UTC Unix milliseconds
  sequenceNumber: z.number().optional(),
  source: z.string(), // e.g. "finnhub", "alpaca", "demo"
  classification: DataClassificationSchema,
  currency: z.string().default("USD"),
  candle: z.object({
    time: z.number(), // UTC Unix seconds (Lightweight Charts format)
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
    isComplete: z.boolean().default(false),
  }).optional(),
});
export type MarketDataEvent = z.infer<typeof MarketDataEventSchema>;

export const GatewayStatusEventSchema = z.object({
  provider: ProviderTypeSchema,
  status: z.enum(["connected", "connecting", "disconnected", "reconnecting", "degraded", "limit_reached"]),
  activeSubscriptions: z.number(),
  maxSymbols: z.number(),
  lastUpdateTimestamp: z.number().nullable(),
  message: z.string().optional(),
});
export type GatewayStatusEvent = z.infer<typeof GatewayStatusEventSchema>;
