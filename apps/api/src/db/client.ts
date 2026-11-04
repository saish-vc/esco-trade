import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalThis.__prisma;
}

export async function closePrismaClient(): Promise<void> {
  if (globalThis.__prisma) {
    await globalThis.__prisma.$disconnect();
    globalThis.__prisma = undefined as undefined;
  }
}

export const prisma = getPrismaClient();
