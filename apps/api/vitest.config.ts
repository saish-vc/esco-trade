import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/esco_trade?schema=public",
      REDIS_URL: "redis://localhost:6379",
      NODE_ENV: "test",
    },
    deps: {
      interopDefault: true,
    },
  },
});
