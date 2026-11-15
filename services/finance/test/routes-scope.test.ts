import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { createUserLookup } from "../src/db/users.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const userLookup = { findById: async () => undefined };

test("health and readiness endpoints return 200 OK", async (t) => {
  const app = buildApp({ logger: false, readinessCheck: async () => {}, userLookup, jwtSecret });
  t.after(() => app.close());
  await app.ready();

  for (const url of ["/health", "/api/health"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  }
  for (const url of ["/ready", "/api/ready"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ready" });
  }
});

test("non-finance domain routes are NOT mounted in finance service and return 404 NOT_FOUND", async (t) => {
  const app = buildApp({ logger: false, readinessCheck: async () => {}, userLookup, jwtSecret });
  t.after(() => app.close());
  await app.ready();

  for (const url of ["/api/auth/me", "/api/admin/users/pending", "/api/exam/banks/default", "/api/curriculum/subjects", "/api/unknown"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, "NOT_FOUND");
  }
});

test("finance routes require an authenticated, approved session", async (t) => {
  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    financeRawRepository: { list: async () => [], find: async () => undefined, import: async () => { throw new Error("unused"); } },
  });
  t.after(() => app.close());
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/finance/raw/files" });
  assert.equal(res.statusCode, 401);
});

test("createUserLookup resolves user status and step-up password verification via Auth service HTTP API without direct auth DB access", async () => {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const lookup = createUserLookup({
    authServiceUrl: "https://auth.example.invalid/",
    cookieName: "innova_auth",
    signSessionToken: (id) => `signed-${id}`,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, headers, body });

      if (url === "https://auth.example.invalid/api/auth/me") {
        if (headers.cookie === "innova_auth=signed-user-1") {
          return new Response(
            JSON.stringify({
              user: { id: "user-1", email: "user1@example.invalid", approvalStatus: "approved", role: "member" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 });
      }

      if (url === "https://auth.example.invalid/api/auth/login") {
        const parsed = JSON.parse(body ?? "{}") as { email?: string; password?: string };
        const ok = parsed.email === "user1@example.invalid" && parsed.password === "correct-password";
        return new Response(JSON.stringify(ok ? { user: { id: "user-1" } } : { error: { code: "INVALID_CREDENTIALS" } }), {
          status: ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch,
  });

  const found = await lookup.findById("user-1");
  assert.deepEqual(found, {
    id: "user-1",
    email: "user1@example.invalid",
    approvalStatus: "approved",
    role: "member",
  });
  assert.equal(await lookup.findById("missing-user"), undefined);
  assert.equal(await lookup.verifyPassword?.("user-1", "correct-password"), true);
  assert.equal(await lookup.verifyPassword?.("user-1", "wrong-password"), false);
  assert.equal(calls.length, 6);
});

test("createUserLookup attaches cached GCP OIDC ID token to both /api/auth/me and /api/auth/login when enableIamAuth is true", async () => {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600, aud: "https://auth.example.run.app" }),
  ).toString("base64url");
  const oidcJwt = `${header}.${payload}.sig`;
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];

  const lookup = createUserLookup({
    authServiceUrl: "https://auth.example.run.app/",
    cookieName: "innova_auth",
    signSessionToken: (id) => `signed-${id}`,
    enableIamAuth: true,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method, headers });

      if (url.startsWith("http://metadata.google.internal/")) {
        return new Response(oidcJwt, { status: 200 });
      }
      if (url === "https://auth.example.run.app/api/auth/me") {
        return new Response(
          JSON.stringify({
            user: { id: "user-1", email: "user1@example.invalid", approvalStatus: "approved", role: "member" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://auth.example.run.app/api/auth/login") {
        return new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch,
  });

  const user = await lookup.findById("user-1");
  assert.equal(user?.id, "user-1");
  assert.equal(await lookup.verifyPassword?.("user-1", "correct-password"), true);

  // 1 metadata fetch (cached) + findById (/me) + verifyPassword (/me + /login) = 4 calls total
  assert.equal(calls.length, 4);
  assert.equal(
    calls[0].url,
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fauth.example.run.app",
  );
  assert.equal(calls[0].headers["Metadata-Flavor"], "Google");
  for (const apiCall of calls.slice(1)) {
    assert.equal(apiCall.headers["x-serverless-authorization"], `Bearer ${oidcJwt}`);
    assert.equal(apiCall.headers["authorization"], `Bearer ${oidcJwt}`);
  }
});
