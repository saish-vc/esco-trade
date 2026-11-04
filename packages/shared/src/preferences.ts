import { z } from "zod";

export const PreferenceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  theme: z.enum(["light", "dark"]),
  timezone: z.string(),
  key: z.string(),
  value: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Preference = z.infer<typeof PreferenceSchema>;

export const SetPreferenceSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});
