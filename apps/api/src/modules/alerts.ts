import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrismaClient } from "../db/client";
import { alertQueue } from "../worker/alert-worker";

export const AlertSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  instrumentId: z.string().uuid(),
  state: z.enum(["enabled", "paused", "triggered", "expired"]),
  conditionType: z.enum(["crosses_above", "crosses_below", "enters_range"]),
  indicatorType: z.enum(["price", "sma", "ema", "rsi", "macd", "bollinger_upper", "bollinger_lower", "vwap"]),
  threshold: z.number().min(0),
  maxThreshold: z.number().min(0).optional(),
  period: z.number().int().min(1).max(200).optional(),
  fastPeriod: z.number().int().min(1).max(100).optional(),
  slowPeriod: z.number().int().min(1).max(200).optional(),
  signalPeriod: z.number().int().min(1).max(100).optional(),
  repeatable: z.boolean().default(false),
  cooldownSeconds: z.number().int().min(0).max(86400).default(0),
  enabled: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastTriggeredAt: z.date().nullable(),
});

export const AlertConditionsSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid(),
  type: z.enum(["crosses_above", "crosses_below", "enters_range"]),
  indicatorType: z.enum(["price", "sma", "ema", "rsi", "macd", "bollinger_upper", "bollinger_lower", "vwap"]),
  threshold: z.number().min(0),
  maxThreshold: z.number().min(0).optional(),
  period: z.number().int().min(1).max(200).optional(),
  fastPeriod: z.number().int().min(1).max(100).optional(),
  slowPeriod: z.number().int().min(1).max(200).optional(),
  signalPeriod: z.number().int().min(1).max(100).optional(),
});

export type Alert = z.infer<typeof AlertSchema>;
export type AlertCondition = z.infer<typeof AlertConditionsSchema>;

export function registerAlerts(server: FastifyInstance): void {
  server.get("/alerts/:alertId", async (request: any, reply: any) => {
    const prisma = getPrismaClient();
    const { alertId } = request.params;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { conditions: true },
    });

    if (!alert) {
      return reply.status(404).send({ error: "Not found", message: "Alert not found" });
    }

    // Verify ownership
    const userId = request.userId;
    if (alert.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Not your alert" });
    }

    return {
      ...alert,
      conditions: alert.conditions,
    };
  });

  server.get("/alerts", async (request: any, reply: any) => {
    const prisma = getPrismaClient();
    const userId = (request as FastifyRequest & { userId?: string }).userId;
    const page = parseInt((request.query.page as string | undefined) ?? "1");
    const limit = Math.min(parseInt((request.query.limit as string | undefined) ?? "20"), 100);
    const skip = (page - 1) * limit;

    const [alerts, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where: { userId },
        include: { conditions: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where: { userId } }),
    ]);

    return {
      alerts,
      total,
      page,
      limit,
    };
  });

  server.post("/alerts", async (request: any, reply: any) => {
    const prisma = getPrismaClient();
    const userId = (request as FastifyRequest & { userId?: string }).userId;

    const body = request.body as any;

    // Validate ownership of instrument
    const instrument = await prisma.instrument.findFirst({
      where: { id: body.instrumentId },
    });

    if (!instrument) {
      return reply.status(400).send({ error: "Bad request", message: "Instrument not found or not owned" });
    }

    // Create alert with conditions
    const result =      await prisma.$transaction(async (tx: any) => {
      const alert = await tx.alert.create({
        data: {
          userId,
          name: body.name,
          instrumentId: body.instrumentId,
          state: "enabled",
          conditionType: body.conditionType,
          indicatorType: body.indicatorType,
          threshold: body.threshold,
          maxThreshold: body.maxThreshold ?? null,
          period: body.period ?? null,
          fastPeriod: body.fastPeriod ?? null,
          slowPeriod: body.slowPeriod ?? null,
          signalPeriod: body.signalPeriod ?? null,
          repeatable: body.repeatable ?? false,
          cooldownSeconds: body.cooldownSeconds ?? 0,
          enabled: body.enabled ?? true,
        },
      });

      if (body.conditions && body.conditions.length > 0) {
        await tx.alertCondition.createMany({
          data: body.conditions.map((c: any) => ({
            alertId: alert.id,
            ...c,
          })),
        });
      }

      return alert;
    });

    const createdAlert = await prisma.alert.findUnique({
      where: { id: result.id },
      include: { conditions: true },
    });

    // Enqueue first evaluation
    await alertQueue.add("evaluate", {
      alertId: createdAlert!.id,
      instrumentId: createdAlert!.instrumentId,
      timeframe: "1D",
      session: "regular",
      userId: createdAlert!.userId,
    }, { delay: 1000 });

    return createdAlert;
  });

  server.patch("/alerts/:alertId", async (request: any, reply: any) => {
    const prisma = getPrismaClient();
    const userId = (request as FastifyRequest & { userId?: string }).userId;
    const { alertId } = request.params;
    const body = request.body as Partial<Pick<Alert, "name" | "state" | "enabled" | "cooldownSeconds">>;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      return reply.status(404).send({ error: "Not found", message: "Alert not found" });
    }

    if (alert.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Not your alert" });
    }      const updated = await prisma.alert.update({
      where: { id: alertId },
      data: body,
    });

    return updated;
  });

  server.delete<{
    Params: { alertId: string };
    Reply: { deleted: boolean } | { error: string; message: string };
  }>("/alerts/:alertId", async (request, reply) => {
    const prisma = getPrismaClient();
    const userId = (request as FastifyRequest & { userId?: string }).userId;
    const { alertId } = request.params;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      return reply.status(404).send({ error: "Not found", message: "Alert not found" });
    }

    if (alert.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Not your alert" });
    }

    await prisma.$transaction([
      prisma.alertEvent.deleteMany({ where: { alertId } }),
      prisma.alertCondition.deleteMany({ where: { alertId } }),
      prisma.alert.delete({ where: { id: alertId } }),
    ]);

    return { deleted: true };
  });
}
