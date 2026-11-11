import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCurriculumAssetReader,
  createGcsCurriculumAssetReader,
  createMetadataTokenProvider,
} from "../src/curriculum-assets.js";
import { AppError } from "../src/errors.js";

test("createMetadataTokenProvider: fetches token, caches until expiry, and supports reset", async () => {
  let fetchCount = 0;
  let simulatedTime = 1_000_000;
  const mockFetch: typeof fetch = async (input, init) => {
    fetchCount++;
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers?.["Metadata-Flavor"], "Google");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: `token-${fetchCount}`,
        expires_in: 300, // 300 seconds (safety margin: 60s, TTL: 240s = 240,000ms)
      }),
    } as unknown as Response;
  };

  const provider = createMetadataTokenProvider({
    fetchFn: mockFetch,
    now: () => simulatedTime,
  });

  // 1. Initial fetch
  const token1 = await provider();
  assert.equal(token1, "token-1");
  assert.equal(fetchCount, 1);

  // 2. Cache hit within TTL
  simulatedTime += 100_000; // +100s, still valid
  const token2 = await provider();
  assert.equal(token2, "token-1");
  assert.equal(fetchCount, 1);

  // 3. Cache expired
  simulatedTime += 150_000; // total +250s, > 240s TTL
  const token3 = await provider();
  assert.equal(token3, "token-2");
  assert.equal(fetchCount, 2);

  // 4. Reset invalidates cache immediately
  provider.reset();
  const token4 = await provider();
  assert.equal(token4, "token-3");
  assert.equal(fetchCount, 3);
});

test("createMetadataTokenProvider: throws when metadata server errors or returns invalid payload", async () => {
  const failFetch: typeof fetch = async () => ({
    ok: false,
    status: 500,
  } as unknown as Response);

  const provider = createMetadataTokenProvider({ fetchFn: failFetch });
  await assert.rejects(async () => {
    await provider();
  }, /Metadata server error: status 500/);

  const emptyFetch: typeof fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "" }),
  } as unknown as Response);

  const emptyProvider = createMetadataTokenProvider({ fetchFn: emptyFetch });
  await assert.rejects(async () => {
    await emptyProvider();
  }, /Metadata server returned empty access_token/);
});

test("createGcsCurriculumAssetReader: serves private assets with Bearer token from provider", async () => {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  let tokenResetCalled = false;
  const mockTokenProvider = Object.assign(
    async () => "mock-adc-bearer-token",
    { reset: () => { tokenResetCalled = true; } }
  );

  const mockFetch: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), headers: init?.headers as Record<string, string> });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => Buffer.from("synthetic-gcs-bytes"),
    } as unknown as Response;
  };

  const reader = createGcsCurriculumAssetReader({
    bucket: "innova-assets",
    tokenProvider: mockTokenProvider,
    fetchFn: mockFetch,
  });

  const asset = await reader("sample/image.png");
  assert.ok(asset);
  assert.equal(asset.contentType, "image/png");
  assert.deepEqual(asset.bytes, Buffer.from("synthetic-gcs-bytes"));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes("storage.googleapis.com"));
  assert.equal(requests[0].headers["Authorization"], "Bearer mock-adc-bearer-token");
  assert.equal(tokenResetCalled, false);
});

test("createGcsCurriculumAssetReader: handles 404, 401 token invalidation, and masks 503 errors", async () => {
  let tokenResetCalled = false;
  const mockTokenProvider = Object.assign(
    async () => "mock-bearer-token",
    { reset: () => { tokenResetCalled = true; } }
  );

  let responseStatus = 404;
  const mockFetch: typeof fetch = async () => ({
    ok: responseStatus >= 200 && responseStatus < 300,
    status: responseStatus,
    headers: new Headers({ "content-type": "image/png" }),
    arrayBuffer: async () => Buffer.alloc(0),
  } as unknown as Response);

  const reader = createGcsCurriculumAssetReader({
    bucket: "innova-assets",
    tokenProvider: mockTokenProvider,
    fetchFn: mockFetch,
  });

  // 1. 404 returns undefined
  const notFound = await reader("missing/image.png");
  assert.equal(notFound, undefined);

  // 2. 401 resets token cache and throws 503 AppError
  responseStatus = 401;
  await assert.rejects(
    async () => { await reader("protected/image.png"); },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.message, "Private asset storage is unavailable");
      return true;
    }
  );
  assert.equal(tokenResetCalled, true);

  // 3. 500 error throws masked 503 AppError without leaking internal details
  responseStatus = 500;
  await assert.rejects(
    async () => { await reader("error/image.png"); },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.message, "Private asset storage is unavailable");
      return true;
    }
  );
});

test("createCurriculumAssetReader: local filesystem reading and traversal protection", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "learning-asset-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, "valid.png"), Buffer.from("local-png-data"));
  const reader = createCurriculumAssetReader(dir);

  const valid = await reader("valid.png");
  assert.ok(valid);
  assert.equal(valid.contentType, "image/png");
  assert.deepEqual(valid.bytes, Buffer.from("local-png-data"));

  const missing = await reader("missing.png");
  assert.equal(missing, undefined);

  const invalidExtension = await reader("valid.txt");
  assert.equal(invalidExtension, undefined);

  const traversal = await reader("../outside.png");
  assert.equal(traversal, undefined);
});
