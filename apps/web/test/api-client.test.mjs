import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, apiClient } from "../src/shared/api/client.ts";

test("API errors retain the X-Request-Id response header", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  }), {
    status: 500,
    headers: { "content-type": "application/json", "x-request-id": "server-request-id" },
  }));

  await assert.rejects(apiClient.get("/health"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "INTERNAL_ERROR");
    assert.equal(error.requestId, "server-request-id");
    assert.equal("requestId" in error.data, false);
    return true;
  });
});

test("API errors allow a missing request ID header", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { code: "NOT_FOUND", message: "Not found" },
  }), {
    status: 404,
    headers: { "content-type": "application/json" },
  }));

  await assert.rejects(apiClient.get("/missing"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.requestId, undefined);
    return true;
  });
});
