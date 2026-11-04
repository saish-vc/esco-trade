import { FastifyPluginCallback } from "fastify";
import { prisma } from "../db/client";
import { SetPreferenceSchema } from "@esco-trade/shared";

export const preferencesPlugin: FastifyPluginCallback = async (fastify, opts) => {
  fastify.get<{}>("/preferences", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["preferences"],
      summary: "Get my preferences",
      response: { 200: { type: "array", items: { $ref: "Preference#" } } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const prefs = await prisma.preference.findMany({
      where: { userId: user.id },
    });
    return prefs.map((p: { id: string; userId: string; theme: string; timezone: string; key: string; value: unknown; createdAt: Date; updatedAt: Date }) => ({
      id: p.id,
      userId: p.userId,
      theme: p.theme,
      timezone: p.timezone,
      key: p.key,
      value: p.value as Record<string, unknown>,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  });

  fastify.put<{ Body: { key: string; value: unknown } }>("/preferences", {
    // preHandler: [fastify.authenticate] — auth not wired yet; protected routes return 401.
    // TODO: wire auth library and restore preHandler: [fastify.authenticate],
    schema: {
      tags: ["preferences"],
      summary: "Set a preference",
      body: { type: "object", required: ["key", "value"], properties: { key: { type: "string", minLength: 1 }, value: { type: "object" } } },
      response: { 200: { $ref: "Preference#" } },
    },
  }, async (req, reply) => {
    const user = (req as any).user as { id: string } | null;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const body = SetPreferenceSchema.parse(req.body);
    const upserted = await prisma.preference.upsert({
      where: { u_user_preference_key: { userId: user.id, key: body.key } },
      update: { value: body.value as any },
      create: { userId: user.id, key: body.key, value: body.value as any },
    });
    return {
      id: upserted.id,
      userId: upserted.userId,
      theme: upserted.theme,
      timezone: upserted.timezone,
      key: upserted.key,
      value: upserted.value as Record<string, unknown>,
      createdAt: upserted.createdAt,
      updatedAt: upserted.updatedAt,
    };
  });
};
