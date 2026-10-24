import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { neon, neonConfig } from "@neondatabase/serverless";
import { buildApp } from "../src/app.js";
import { createApplicationLogger } from "../src/logger.js";
import { runReadinessCheck } from "../src/readiness.js";

test("readiness timeout returns safe 503, aborts the check and leaves health independent", async (t) => {
  const lines: string[] = [];
  const logger = createApplicationLogger({ destination: new Writable({
    write(chunk, _encoding, callback) { lines.push(String(chunk)); callback(); },
  }) });
  let signal: AbortSignal | undefined;
  const app = buildApp({
    logger,
    jwtSecret: "synthetic-readiness-secret-at-least-32-characters",
    examRepository: { async find() { return undefined; }, async create() { throw new Error("unused"); } },
    userRepository: { async findById() {}, async findByEmail() {}, async create() {}, async findPending() { return []; }, async approvePending() {} },
    readinessTimeoutMs: 30,
    readinessCheck: async (value) => { signal = value; await new Promise(() => {}); },
  });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
  assert.equal(signal, undefined);
  const response = await app.inject({ url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: "not_ready" });
  assert.equal(signal?.aborted, true);
  const log = lines.map((line) => JSON.parse(line)).find((entry) => entry.event === "app.readiness.failed");
  assert.equal(log.reason, "timeout");
  assert.equal(log.reqId, response.headers["x-request-id"]);
  assert.equal(log.err, undefined);
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
});

test("a late readiness failure is handled and a later healthy probe succeeds", async () => {
  let rejectCheck: (error: Error) => void = () => {};
  await assert.rejects(runReadinessCheck(() => new Promise((_, reject) => { rejectCheck = reject; }), 20), { name: "TimeoutError" });
  rejectCheck(new Error("synthetic private late failure"));
  await runReadinessCheck(async (signal) => { assert.equal(signal.aborted, false); }, 100);
});

test("readiness cancellation reaches the Neon HTTP transport without a real DB", async () => {
  const originalFetch = neonConfig.fetchFunction;
  let aborted = false;
  neonConfig.fetchFunction = async (_input, options) => new Promise((_resolve, reject) => {
    const signal = options?.signal;
    assert.ok(signal);
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  });
  try {
    const client = neon("postgresql://synthetic:synthetic@ep-synthetic.invalid/synthetic");
    await assert.rejects(runReadinessCheck((signal) => client.query("select 1", [], { fetchOptions: { signal } }), 30), { name: "TimeoutError" });
    assert.equal(aborted, true);
  } finally {
    neonConfig.fetchFunction = originalFetch;
  }
});
