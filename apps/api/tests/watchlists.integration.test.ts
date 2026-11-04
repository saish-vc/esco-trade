import { FastifyInstance } from "fastify";
import { watchlistsPlugin } from "../src/modules/watchlists";
import { describe, it, expect, beforeEach } from "vitest";

// We test the watchlists module in isolation. Since auth is "not yet wired",
// protected endpoints return 401 unless we stub a user onto the request.
// Here we inject a fake user via decorate to test ownership semantics.

function attachFakeUser(fastify: FastifyInstance, userId: string) {
  // The watchlists module reads (req as any).user.id. We mimic that.
  // This is a seam for testing without wiring the full auth library.
  fastify.addHook("onRequest", async (req, reply) => {
    // Only for test routes; real app uses auth library session.
    if (req.url.startsWith("/api/v1/")) {
      (req as any).user = { id: userId };
    }
  });
}

describe("watchlists module — ownership & persistence", () => {
  let fastifyA: FastifyInstance;
  let fastifyB: FastifyInstance;
  let watchlistIdA: string | null = null;
  let watchlistIdB: string | null = null;
  let instrumentIdA: string | null = null;
  let instrumentIdB: string | null = null;

  beforeEach(async () => {
    const { schemas } = await import("../src/schemas");
    const fa = (await import("fastify")).default();
    const fb = (await import("fastify")).default();
    for (const schema of schemas) {
      fa.addSchema(schema);
      fb.addSchema(schema);
    }
    fastifyA = fa;
    fastifyB = fb;

    // Both instances point at the same DB via prisma singleton; that's fine for integration.

    // Attach fake user identities
    attachFakeUser(fastifyA, "user-a-uuid");
    attachFakeUser(fastifyB, "user-b-uuid");

    await fastifyA.register(watchlistsPlugin, { prefix: "/api/v1" });
    await fastifyB.register(watchlistsPlugin, { prefix: "/api/v1" });

    await Promise.all([fastifyA.ready(), fastifyB.ready()]);

    // Ensure there is at least one instrument to reference (seed can create these)
    const prisma = await import("../src/db/client").then((m) => m.prisma);
    // Ensure users exist in the DB for foreign key constraints
    await prisma.user.upsert({
      where: { id: "user-a-uuid" },
      update: {},
      create: { id: "user-a-uuid", email: "user-a@example.com" },
    });
    await prisma.user.upsert({
      where: { id: "user-b-uuid" },
      update: {},
      create: { id: "user-b-uuid", email: "user-b@example.com" },
    });

    let inst = await prisma.instrument.findFirst({ where: { internalTicker: "TESTA" } });
    if (!inst) {
      inst = await prisma.instrument.create({
        data: {
          internalTicker: "TESTA",
          name: "Test A",
          exchange: "TESTEX",
          provider: "demo",
          assetType: "equity",
          currency: "USD",
        },
      });
    }
    instrumentIdA = inst.id;

    let instB = await prisma.instrument.findFirst({ where: { internalTicker: "TESTB" } });
    if (!instB) {
      instB = await prisma.instrument.create({
        data: {
          internalTicker: "TESTB",
          name: "Test B",
          exchange: "TESTEX",
          provider: "demo",
          assetType: "equity",
          currency: "USD",
        },
      });
    }
    instrumentIdB = instB.id;
  });

  afterEach(async () => {
    if (fastifyA) await fastifyA.close();
    if (fastifyB) await fastifyB.close();
    const prisma = await import("../src/db/client").then((m) => m.prisma);
    await prisma.watchlistItem.deleteMany();
    await prisma.watchlist.deleteMany();
  });

  it("user A can create a watchlist", async () => {
    const res = await fastifyA.inject({
      method: "POST",
      url: "/api/v1/watchlists",
      payload: { name: "A's list" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.name).toBe("A's list");
    watchlistIdA = body.id;
  });

  it("user A can add an item to their own watchlist", async () => {
    // Ensure user A has a watchlist
    const createRes = await fastifyA.inject({
      method: "POST",
      url: "/api/v1/watchlists",
      payload: { name: "A's add item list" },
    });
    expect(createRes.statusCode).toBe(201);
    watchlistIdA = JSON.parse(createRes.payload).id;

    expect(watchlistIdA).toBeTruthy();
    expect(instrumentIdA).toBeTruthy();
    const res = await fastifyA.inject({
      method: "POST",
      url: `/api/v1/watchlists/${watchlistIdA}/items`,
      payload: { watchlistId: watchlistIdA, instrumentId: instrumentIdA! },
    });
    if (res.statusCode !== 201) console.log("ADD ITEM RES:", res.payload);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.instrument.internalTicker).toBe("TESTA");
  });

  it("user A cannot read user B's watchlists (returns empty)", async () => {
    // Create a watchlist as user B first
    expect(watchlistIdB || instrumentIdB).toBeTruthy();
    if (!watchlistIdB) {
      const resB = await fastifyB.inject({
        method: "POST",
        url: "/api/v1/watchlists",
        payload: { name: "B's list" },
      });
      expect(resB.statusCode).toBe(201);
      watchlistIdB = JSON.parse(resB.payload).id;
    }
    if (!instrumentIdB) throw new Error("instrumentIdB missing");

    // Add item as user B
    await fastifyB.inject({
      method: "POST",
      url: `/api/v1/watchlists/${watchlistIdB}/items`,
      payload: { watchlistId: watchlistIdB, instrumentId: instrumentIdB },
    });

    // User A lists watchlists: should not see user B's watchlist
    const listRes = await fastifyA.inject({ method: "GET", url: "/api/v1/watchlists" });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload) as Array<{ id: string }>;
    expect(listBody.find((w) => w.id === watchlistIdB)).toBeUndefined();
  });

  it("user A cannot add an item to user B's watchlist (404)", async () => {
    expect(watchlistIdB).toBeTruthy();
    expect(instrumentIdA).toBeTruthy();
    const res = await fastifyA.inject({
      method: "POST",
      url: `/api/v1/watchlists/${watchlistIdB}/items`,
      payload: { watchlistId: watchlistIdB, instrumentId: instrumentIdA! },
    });
    // Watchlist not found from user A's perspective
    expect(res.statusCode).toBe(404);
  });

  it("user A cannot delete user B's watchlist", async () => {
    expect(watchlistIdB).toBeTruthy();
    const res = await fastifyA.inject({
      method: "DELETE",
      url: `/api/v1/watchlists/${watchlistIdB}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("user A cannot reorder items in user B's watchlist", async () => {
    // Create a watchlist as user B first
    const resB = await fastifyB.inject({
      method: "POST",
      url: "/api/v1/watchlists",
      payload: { name: "B's reorder list" },
    });
    expect(resB.statusCode).toBe(201);
    const bListId = JSON.parse(resB.payload).id;

    const res = await fastifyA.inject({
      method: "PUT",
      url: `/api/v1/watchlists/${bListId}/items/reorder`,
      payload: { itemIds: [] },
    });
    if (res.statusCode !== 404) console.log("REORDER ERR:", res.payload);
    expect(res.statusCode).toBe(404);
  });

  it("delete clears user A's watchlist", async () => {
    // Ensure user A has a watchlist to delete
    const createRes = await fastifyA.inject({
      method: "POST",
      url: "/api/v1/watchlists",
      payload: { name: "A's delete list" },
    });
    expect(createRes.statusCode).toBe(201);
    const toDeleteId = JSON.parse(createRes.payload).id;

    const res = await fastifyA.inject({
      method: "DELETE",
      url: `/api/v1/watchlists/${toDeleteId}`,
    });
    expect(res.statusCode).toBe(204);
    const getRes = await fastifyA.inject({ method: "GET", url: "/api/v1/watchlists" });
    const listBody = JSON.parse(getRes.payload) as Array<{ id: string }>;
    expect(listBody.find((w) => w.id === toDeleteId)).toBeUndefined();
  });

  it("persistence: created watchlist survives a fresh GET", async () => {
    // Create a brand-new watchlist and read it back in a separate inject
    const createRes = await fastifyA.inject({
      method: "POST",
      url: "/api/v1/watchlists",
      payload: { name: "Persistence test" },
    });
    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.payload);
    const getRes = await fastifyA.inject({ method: "GET", url: `/api/v1/watchlists/${body.id}` });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload) as { name: string; items: unknown[] };
    expect(getBody.name).toBe("Persistence test");
  });
});
