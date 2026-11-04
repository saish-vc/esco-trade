import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
    // Prisma client needs to be generated before tests that import it.
    // We assume `prisma generate` has run. In CI, ensure this happens.
    deps: {
      interopDefault: true,
    },
  },
});
