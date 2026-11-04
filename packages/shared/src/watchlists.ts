import { z } from "zod";
import { InstrumentSchema } from "./instruments";

export const CreateWatchlistSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateWatchlistInput = z.infer<typeof CreateWatchlistSchema>;

export const WatchlistSchema = CreateWatchlistSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Watchlist = z.infer<typeof WatchlistSchema>;

export const AddWatchlistItemSchema = z.object({
  watchlistId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  columns: z.record(z.string(), z.unknown()).optional(),
});

export type AddWatchlistItemInput = z.infer<typeof AddWatchlistItemSchema>;

export const WatchlistItemSchema = z.object({
  id: z.string().uuid(),
  watchlistId: z.string().uuid(),
  instrument: InstrumentSchema,
  sortOrder: z.number().int(),
  columns: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WatchlistItemType = z.infer<typeof WatchlistItemSchema>;

export const WatchlistWithItemsSchema = WatchlistSchema.extend({
  items: z.array(WatchlistItemSchema),
});

export type WatchlistWithItems = z.infer<typeof WatchlistWithItemsSchema>;

export const ReorderWatchlistItemsSchema = z.object({
  watchlistId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()),
});

export type ReorderWatchlistItemsInput = z.infer<typeof ReorderWatchlistItemsSchema>;
