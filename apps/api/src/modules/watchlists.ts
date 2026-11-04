import { FastifyPluginCallback } from "fastify";
import { prisma } from "../db/client";
import { z } from "zod";
import {
  CreateWatchlistSchema,
  AddWatchlistItemSchema,
  ReorderWatchlistItemsSchema,
  WatchlistWithItemsSchema,
  WatchlistItemSchema,
} from "@esco-trade/shared";

export const watchlistsPlugin: FastifyPluginCallback = async (fastify, opts) => {
  // Ownership: every watchlist access is gated by the authenticated user id.
  // The user id comes from the session (set by auth library). We never trust a
  // client-supplied user id.

  fastify.get<{
    Querystring: { limit?: number; cursor?: string };
  }>("/watchlists", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "List my watchlists",
      querystring: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 200 }, cursor: { type: "string" } },
      },
      response: { 200: { type: "array", items: { $ref: "Watchlist#" } } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const watchlists = await prisma.watchlist.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    return watchlists.map((w: { id: string; userId: string; name: string; sortOrder: number; createdAt: Date; updatedAt: Date }) => ({
      id: w.id,
      userId: w.userId,
      name: w.name,
      sortOrder: w.sortOrder,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  });

  fastify.post<{ Body: { name: string } }>("/watchlists", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Create a watchlist",
      body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } },
      response: { 201: { $ref: "Watchlist#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const body = CreateWatchlistSchema.parse(req.body);
    const created = await prisma.watchlist.create({
      data: { userId: user.id, name: body.name },
    });
    return reply.code(201).send({
      id: created.id,
      userId: created.userId,
      name: created.name,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  });

  fastify.delete<{ Params: { id: string } }>("/watchlists/:id", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Delete a watchlist (owned by me)",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 204: { type: "object" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const id = req.params.id;
    const existing = await prisma.watchlist.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return reply.code(404).send({ error: "Watchlist not found" });
    await prisma.watchlist.delete({ where: { id } });
    return reply.code(204).send();
  });

  fastify.get<{ Params: { id: string } }>("/watchlists/:id", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Get a watchlist with items",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 200: { $ref: "WatchlistWithItems#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const id = req.params.id;
    const watchlist = await prisma.watchlist.findFirst({
      where: { id, userId: user.id },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { instrument: true },
        },
      },
    });
    if (!watchlist) return reply.code(404).send({ error: "Watchlist not found" });
    return {
      id: watchlist.id,
      userId: watchlist.userId,
      name: watchlist.name,
      sortOrder: watchlist.sortOrder,
      createdAt: watchlist.createdAt,
      updatedAt: watchlist.updatedAt,
      items: watchlist.items.map((it: { id: string; watchlistId: string; instrument: unknown; sortOrder: number; columns: Record<string, unknown>; createdAt: Date; updatedAt: Date }) => ({
        id: it.id,
        watchlistId: it.watchlistId,
        instrument: it.instrument as unknown as import("@esco-trade/shared").Instrument,
        sortOrder: it.sortOrder,
        columns: (it.columns as Record<string, unknown>) ?? {},
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    };
  });

  fastify.post<{ Body: { watchlistId: string; instrumentId: string; sortOrder?: number; columns?: Record<string, unknown> } }>("/watchlists/:id/items", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Add an instrument to a watchlist",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        required: ["watchlistId", "instrumentId"],
        properties: {
          watchlistId: { type: "string", format: "uuid" },
          instrumentId: { type: "string", format: "uuid" },
          sortOrder: { type: "integer" },
          columns: { type: "object" },
        },
      },
      response: { 201: { $ref: "WatchlistItem#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const body = AddWatchlistItemSchema.parse(req.body);
    // Ownership: watchlistId must belong to me
    const watchlist = await prisma.watchlist.findFirst({
      where: { id: body.watchlistId, userId: user.id },
    });
    if (!watchlist) return reply.code(404).send({ error: "Watchlist not found" });
    const created = await prisma.watchlistItem.create({
      data: {
        watchlistId: body.watchlistId,
        instrumentId: body.instrumentId,
        sortOrder: body.sortOrder ?? 0,
        columns: (body.columns ?? {}) as any,
      },
      include: { instrument: true },
    });
    return reply.code(201).send({
      id: created.id,
      watchlistId: created.watchlistId,
      instrument: created.instrument as unknown as import("@esco-trade/shared").Instrument,
      sortOrder: created.sortOrder,
      columns: (created.columns as Record<string, unknown>) ?? {},
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  });

  fastify.delete<{ Params: { watchlistId: string; itemId: string } }>("/watchlists/:watchlistId/items/:itemId", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Remove an item from a watchlist",
      params: { type: "object", properties: { watchlistId: { type: "string", format: "uuid" }, itemId: { type: "string", format: "uuid" } } },
      response: { 204: { type: "object" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const { watchlistId, itemId } = req.params;
    const item = await prisma.watchlistItem.findFirst({
      where: { id: itemId, watchlistId, watchlist: { userId: user.id } },
    });
    if (!item) return reply.code(404).send({ error: "Item not found" });
    await prisma.watchlistItem.delete({ where: { id: itemId } });
    return reply.code(204).send();
  });

  fastify.put<{ Params: { id: string }; Body: { itemIds: string[] } }>("/watchlists/:id/items/reorder", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate]
    schema: {
      tags: ["watchlists"],
      summary: "Reorder watchlist items by item id order",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: { type: "object", required: ["itemIds"], properties: { itemIds: { type: "array", items: { type: "string", format: "uuid" } } } },
      response: { 200: { $ref: "WatchlistWithItems#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const id = req.params.id;
    const body = ReorderWatchlistItemsSchema.parse(req.body);
    const watchlist = await prisma.watchlist.findFirst({
      where: { id, userId: user.id },
      include: { items: true },
    });
    if (!watchlist) return reply.code(404).send({ error: "Watchlist not found" });
    // Validate all itemIds belong to this watchlist and user
    const items = watchlist.items as any[];
    const itemIds = new Set(body.itemIds);
    const ownedIds = new Set(items.map((i) => i.id));
    for (const id of body.itemIds) {
      if (!ownedIds.has(id)) {
        return reply.code(400).send({ error: `Item ${id} is not in this watchlist` });
      }
    }
    await prisma.$transaction(
      body.itemIds.map((itemId, idx) =>
        prisma.watchlistItem.update({
          where: { id: itemId },
          data: { sortOrder: idx },
        })
      )
    );
    const updated = await prisma.watchlistItem.findMany({
      where: { watchlistId: id },
      orderBy: { sortOrder: "asc" },
      include: { instrument: true },
    });
    return {
      id: watchlist.id,
      userId: watchlist.userId,
      name: watchlist.name,
      sortOrder: watchlist.sortOrder,
      createdAt: watchlist.createdAt,
      updatedAt: watchlist.updatedAt,
      items: updated.map((it: { id: string; watchlistId: string; instrument: unknown; sortOrder: number; columns: Record<string, unknown>; createdAt: Date; updatedAt: Date }) => ({
        id: it.id,
        watchlistId: it.watchlistId,
        instrument: it.instrument as unknown as import("@esco-trade/shared").Instrument,
        sortOrder: it.sortOrder,
        columns: (it.columns as Record<string, unknown>) ?? {},
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    };
  });
};
