import { FastifyPluginCallback } from "fastify";
import { demoProvider } from "./marketdata";
import type { Instrument } from "@esco-trade/shared";

export const instrumentsPlugin: FastifyPluginCallback = async (fastify, opts) => {
  // This module re-exposes the marketdata provider's search/metadata with an
  // instruments-focused surface. Public live-data redistribution stays disabled
  // until licensing is verified (see docs/DATA_LICENSING.md).

  fastify.get<{
    Querystring: { q?: string; limit?: number; cursor?: string };
  }>("/instruments/search", {
    schema: {
      tags: ["instruments"],
      summary: "Search instruments by ticker or name",
      querystring: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 }, cursor: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          properties: {
            instruments: { type: "array", items: { $ref: "Instrument#" } },
            nextCursor: { type: "string" },
          },
        },
      },
    },
  }, async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const instruments = await demoProvider.search(q).then((list) => list.slice(0, limit));
    return {
      instruments: instruments as unknown as Instrument[],
      nextCursor: undefined,
    };
  });

  fastify.get<{ Params: { id: string } }>("/instruments/:id", {
    schema: {
      tags: ["instruments"],
      summary: "Instrument metadata by id",
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 200: { $ref: "Instrument#" } },
    },
  }, async (req, reply) => {
    const meta = await demoProvider.metadata(req.params.id);
    if (!meta) return reply.code(404).send({ error: "Instrument not found" });
    return meta as unknown as Instrument;
  });
};
