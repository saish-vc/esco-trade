import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) {
        console.error("Redis retry limit exceeded, discarding connection");
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      const error = err as Error & { code?: string };
      const targetError = "READONLY";
      if (error.code === targetError) {
        return true;
      }
      return false;
    },
    enableReadyCheck: true,
  });

  client.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  client.on("connect", () => {
    console.log("Redis connected");
  });

  client.on("ready", () => {
    console.log("Redis ready");
  });

  client.on("close", () => {
    console.log("Redis connection closed");
  });

  client.on("reconnecting", () => {
    console.log("Redis reconnecting...");
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedisClient();
  }
  return globalForRedis.redis;
}

export async function closeRedisClient(): Promise<void> {
  if (globalForRedis.redis) {
    await globalForRedis.redis.quit();
    globalForRedis.redis = undefined;
  }
}
