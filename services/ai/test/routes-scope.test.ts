import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const userLookup = { findById: async () => undefined };

test("health and readiness endpoints return 200 OK", async (t) => {
  const app = buildApp({
    logger: false,
    readinessCheck: async () => {},
    userLookup,
    jwtSecret,
  });
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

test("non-ai domain routes are NOT mounted in AI service and return 404 NOT_FOUND", async (t) => {
  const app = buildApp({
    logger: false,
    readinessCheck: async () => {},
    userLookup,
    jwtSecret,
  });
  t.after(() => app.close());
  await app.ready();

  for (const url of [
    "/api/auth/me",
    "/api/admin/users/pending",
    "/api/exam/banks/default",
    "/api/finance/raw/files",
    "/api/unknown",
  ]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, "NOT_FOUND");
  }
});
