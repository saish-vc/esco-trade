import { FastifyPluginCallback } from "fastify";
// Auth library (Auth.js or Better Auth) will be wired here.
// For Phase 1 vertical slice we expose a minimal session boundary
// and clearly mark the auth library integration as "to be wired".
// No hand-rolled password storage or cryptography.

export const authPlugin: FastifyPluginCallback = async (fastify, opts) => {
  fastify.decorateRequest("authenticate", async function (this: any) {
    // Placeholder: in Phase 1 we rely on the auth library session plugin.
    // Until wired, protected routes will fail closed (no valid session).
    // This is a boundary, not an implementation.
    throw new Error("Authentication not yet wired");
  });

  // Sessions are HTTP-only, Secure, SameSite cookies managed by the auth library.
  // Rate limiting is applied globally via @fastify/rate-limit.

  fastify.get("/auth/me", {
    schema: {
      tags: ["auth"],
      summary: "Get current user profile",
      response: { 200: { type: "object", properties: { user: { type: "object" } } } },
    },
  }, async (req, reply) => {
    // Requires auth library session; placeholder returns 401 until wired.
    throw new Error("Authentication not yet wired");
  });

  fastify.post("/auth/logout", {
    schema: {
      tags: ["auth"],
      summary: "Sign out",
      response: { 200: { type: "object" } },
    },
  }, async (req, reply) => {
    // Destroy session cookie managed by auth library.
    throw new Error("Authentication not yet wired");
  });

  // Audit logging for sensitive account actions is added once auth is wired.
};
