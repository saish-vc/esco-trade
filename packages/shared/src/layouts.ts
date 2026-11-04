import { z } from "zod";

export const CreateLayoutSchema = z.object({
  name: z.string().optional(),
  instrumentId: z.string().uuid().optional(),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"]).optional(),
  chartType: z.enum(["candlestick", "line", "area", "ohlc"]).optional(),
  scale: z.enum(["linear", "log"]).optional(),
  drawings: z.array(z.unknown()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export type CreateLayoutInput = z.infer<typeof CreateLayoutSchema>;

export const LayoutSchema = CreateLayoutSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Layout = z.infer<typeof LayoutSchema>;
