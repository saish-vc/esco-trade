import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPrismaClient } from "../db/client";
import { getRedisClient } from "../db/redis";

export function registerHealth(server: FastifyInstance): void {
  server.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: "ok", timestamp: Date.now() };
  });

  server.get("/ready", async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: { name: string; status: "ok" | "error"; latency?: number }[] = [];

    // Check database
    const dbStart = Date.now();
    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      checks.push({ name: "database", status: "ok", latency: Date.now() - dbStart });
    } catch (err) {
      checks.push({ name: "database", status: "error", latency: Date.now() - dbStart });
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      const redis = getRedisClient();
      await redis.ping();
      checks.push({ name: "redis", status: "ok", latency: Date.now() - redisStart });
    } catch (err) {
      checks.push({ name: "redis", status: "error", latency: Date.now() - redisStart });
    }

    const allOk = checks.every((c) => c.status === "ok");

    return {
      status: allOk ? "ready" : "not_ready",
      checks,
      timestamp: Date.now(),
    };
  });

  server.get("/live", async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: "alive", timestamp: Date.now() };
  });
}
