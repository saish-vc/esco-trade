import Fastify, { type FastifyInstance } from "fastify";
import autoload from "@fastify/autoload";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { join } from "path";
import { registerWebSocket } from "./modules/websocket";
import { registerHealth } from "./modules/health";
import { getRedisClient, closeRedisClient } from "./db/redis";
import { getPrismaClient, closePrismaClient } from "./db/client";
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // CORS: restrictive in prod; open in dev for local web dev
  await fastify.register(cors, {
    origin: process.env.NODE_ENV === "production"
      ? (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)
      : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["Link", "X-Request-Id"],
  });

  // Cookies (session cookies must be HTTP-only, Secure, SameSite)
  await fastify.register(cookie, {
    hook: "onRequest",
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.API_URL ?? "http://localhost:4000"],
        frameSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // OpenAPI docs (for HTTP contract; not for secret endpoints)
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Esco Trade API",
        description: "Market analysis API (no brokerage, no investment advice).",
        version: "0.1.0",
      },
      servers: [
        { url: process.env.API_URL ?? "http://localhost:4000", description: "API" },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Autoload modules from modules/
  await fastify.register(autoload, {
    dir: join(__dirname, "modules"),
    options: { forceESM: false },
  });

  // WebSocket for real-time streaming (Phase 2)
  await fastify.register(async (instance) => {
    registerWebSocket(instance);
  });

  // Health and readiness endpoints (Phase 2)
  await fastify.register(async (instance) => {
    registerHealth(instance);
  });

  // Graceful shutdown handling (Phase 2)
  const gracefulShutdown = async (signal: string) => {
    console.log(`
Received ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    await fastify.close();
    
    // Close WebSocket
    console.log("WebSocket server closed");
    
    // Close Redis
    await closeRedisClient();
    console.log("Redis connection closed");
    
    // Close Prisma
    await closePrismaClient();
    console.log("Prisma connection closed");
    
    console.log("Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Global hooks
  fastify.addHook("onRequest", async (req, reply) => {
    const requestId = (req as any).id ?? crypto.randomUUID();
    (req as any).requestId = requestId;
    reply.header("X-Request-Id", requestId);
  });

  fastify.addHook("onResponse", async (req, reply) => {
    // secret redaction is done in logging via pino serializer; nothing here.
  });

  // Health / readiness
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  fastify.get("/ready", async () => {
    // In Phase 1, "ready" = process running; DB check added in Phase 2.
    return { status: "ok" };
  });

  return fastify;
}

(async () => {
  const fastify = await buildServer();
  try {
    // Initialize Redis client
    const redis = getRedisClient();
    await redis.ping();
    console.log("Redis connected");

    // Initialize Prisma client
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    console.log("Prisma connected");

    // Start alert worker (Phase 2)
    startAlertWorker();
    console.log("Alert worker started");

    const address = await fastify.listen({ port: parseInt(process.env.API_PORT ?? "4000", 10), host: "0.0.0.0" });
    console.log("API listening at", address);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();

try {
  // Initialize Redis client
  const redis = getRedisClient();
  await redis.ping();
  console.log("Redis connected");
  
  // Initialize Prisma client
  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;
  console.log("Prisma connected");
  
  // Start alert worker (Phase 2)
  startAlertWorker();
  console.log("Alert worker started");

  const address = await fastify.listen({ port: parseInt(process.env.API_PORT ?? "4000", 10), host: "0.0.0.0" });
  console.log("API listening at", address);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
