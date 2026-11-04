import { FastifyPluginCallback } from "fastify";
import { prisma } from "../db/client";
import { CreateLayoutSchema, LayoutSchema } from "@esco-trade/shared";

export const layoutsPlugin: FastifyPluginCallback = async (fastify, opts) => {
  fastify.get<Record<string, never>>("/layouts", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["layouts"],
      summary: "List my chart layouts",
      response: { 200: { type: "array", items: { $ref: "Layout#" } } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const layouts = await prisma.chartLayout.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return layouts.map((l: { id: string; userId: string; name: string; instrumentId: string; timeframe: string; chartType: string; scale: string; drawings: unknown[]; preferences: Record<string, unknown>; createdAt: Date; updatedAt: Date }) => ({
      id: l.id,
      userId: l.userId,
      name: l.name,
      instrumentId: l.instrumentId,
      timeframe: l.timeframe,
      chartType: l.chartType,
      scale: l.scale,
      drawings: (l.drawings as unknown[]),
      preferences: (l.preferences as Record<string, unknown>) ?? {},
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  });

  fastify.post<{ Body: Record<string, unknown> }>("/layouts", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["layouts"],
      summary: "Create/save a chart layout",
      body: { type: "object", properties: { name: { type: "string" }, instrumentId: { type: "string", format: "uuid" }, timeframe: { type: "string" }, chartType: { type: "string" }, scale: { type: "string" }, drawings: { type: "array" }, preferences: { type: "object" } } },
      response: { 201: { $ref: "Layout#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const body = CreateLayoutSchema.parse(req.body as any);
    const created = await prisma.chartLayout.create({
      data: {
        userId: user.id,
        name: body.name,
        instrumentId: body.instrumentId,
        timeframe: body.timeframe,
        chartType: body.chartType,
        scale: body.scale,
        drawings: (body.drawings ?? []) as any,
        preferences: (body.preferences ?? {}) as any,
      },
    });
    return reply.code(201).send({
      id: created.id,
      userId: created.userId,
      name: created.name,
      instrumentId: created.instrumentId,
      timeframe: created.timeframe,
      chartType: created.chartType,
      scale: created.scale,
      drawings: (created.drawings as unknown[]),
      preferences: (created.preferences as Record<string, unknown>) ?? {},
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  });

  fastify.put<{ Params: { id: string } }>("/layouts/:id", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["layouts"],
      summary: "Update a chart layout (owned by me)",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", properties: { name: { type: "string" }, instrumentId: { type: "string", format: "uuid" }, timeframe: { type: "string" }, chartType: { type: "string" }, scale: { type: "string" }, drawings: { type: "array" }, preferences: { type: "object" } } },
      response: { 200: { $ref: "Layout#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const id = req.params.id;
    const existing = await prisma.chartLayout.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return reply.code(404).send({ error: "Layout not found" });
    const body = CreateLayoutSchema.partial().parse(req.body as any);
    const updated = await prisma.chartLayout.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.instrumentId !== undefined && { instrumentId: body.instrumentId }),
        ...(body.timeframe !== undefined && { timeframe: body.timeframe }),
        ...(body.chartType !== undefined && { chartType: body.chartType }),
        ...(body.scale !== undefined && { scale: body.scale }),
        ...(body.drawings !== undefined && { drawings: body.drawings as any }),
        ...(body.preferences !== undefined && { preferences: body.preferences as any }),
      },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      instrumentId: updated.instrumentId,
      timeframe: updated.timeframe,
      chartType: updated.chartType,
      scale: updated.scale,
      drawings: (updated.drawings as unknown[]),
      preferences: (updated.preferences as Record<string, unknown>) ?? {},
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  });

  fastify.delete<{ Params: { id: string } }>("/layouts/:id", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["layouts"],
      summary: "Delete a chart layout (owned by me)",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 204: { type: "object" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const id = req.params.id;
    const existing = await prisma.chartLayout.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return reply.code(404).send({ error: "Layout not found" });
    await prisma.chartLayout.delete({ where: { id } });
    return reply.code(204).send();
  });
};
