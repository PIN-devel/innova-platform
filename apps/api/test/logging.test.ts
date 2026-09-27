import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import type { ExamRepository } from "../src/db/exam.js";
import type { UserRepository } from "../src/db/users.js";
import { buildApp } from "../src/app.js";
import { createApplicationLogger } from "../src/logger.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const userId = "f5f8301d-996b-461b-95c9-9a72162023d6";

function captureLogger(level = "info") {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = createApplicationLogger({ level, destination });
  return { logger, lines };
}

function repositories({ failFind = false } = {}): { exams: ExamRepository; users: UserRepository } {
  return {
    exams: {
      async find() {
        if (failFind) throw new Error("private database failure marker");
        return undefined;
      },
      async create() { throw new Error("unused"); },
    },
    users: {
      async findById(id) { return id === userId ? { id, email: "test@example.com", passwordHash: "unused" } : undefined; },
      async findByEmail() { return undefined; },
      async create() { return undefined; },
    },
  };
}

function readLogs(lines: string[]) {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("request IDs are server generated, returned in headers, and completion logs omit private request data", async (t) => {
  const { logger, lines } = captureLogger();
  const { exams, users } = repositories();
  const app = buildApp({ logger, examRepository: exams, userRepository: users, jwtSecret });
  t.after(async () => { await app.close(); logger.flush(); });

  const first = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "caller-controlled" } });
  const second = await app.inject({ method: "GET", url: "/health" });
  const firstId = first.headers["x-request-id"];
  const secondId = second.headers["x-request-id"];
  assert.match(String(firstId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(firstId, "caller-controlled");
  assert.notEqual(firstId, secondId);

  const privateValues = ["body-password-marker", "cookie-marker", "authorization-marker", "query-marker"];
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login?access_token=query-marker",
    headers: {
      cookie: "session=cookie-marker",
      authorization: "Bearer authorization-marker",
    },
    payload: { email: "missing@example.com", password: "body-password-marker" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["x-request-id"] !== undefined, true);

  const logs = readLogs(lines);
  assert.equal(logs.some((entry) => entry.msg === "incoming request"), false);
  assert.equal(logs.some((entry) => entry.msg === "request completed"), false);
  assert.equal(logs.some((entry) => entry.event === "http.request.completed" && entry.path === "/health"), false);
  const completion = logs.find((entry) => entry.event === "http.request.completed");
  assert.ok(completion);
  assert.equal(completion.reqId, response.headers["x-request-id"]);
  assert.equal(completion.method, "POST");
  assert.equal(completion.path, "/api/auth/login");
  assert.equal(completion.statusCode, 401);
  assert.equal(typeof completion.durationMs, "number");
  const serializedLogs = JSON.stringify(logs);
  for (const privateValue of privateValues) assert.equal(serializedLogs.includes(privateValue), false);
  assert.equal(serializedLogs.includes("password"), false);
  assert.equal(serializedLogs.includes("cookie"), false);
  assert.equal(serializedLogs.includes("authorization"), false);
});

test("unexpected errors are correlated in logs and return only the safe API error", async (t) => {
  const { logger, lines } = captureLogger();
  const { exams, users } = repositories({ failFind: true });
  const app = buildApp({ logger, examRepository: exams, userRepository: users, jwtSecret });
  t.after(async () => { await app.close(); logger.flush(); });
  await app.ready();
  const cookie = `exam_drill_auth=${app.jwt.sign({ sub: userId }, { expiresIn: "15m" })}`;

  const response = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie } });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  const requestId = response.headers["x-request-id"];
  assert.ok(requestId);
  const logs = readLogs(lines);
  const errorLog = logs.find((entry) => entry.event === "app.error");
  assert.ok(errorLog);
  assert.equal(errorLog.reqId, requestId);
  assert.equal(errorLog.errorCode, "INTERNAL_ERROR");
  assert.equal(errorLog.statusCode, 500);
  const err = errorLog.err as { message?: string; stack?: string };
  assert.equal(err.message, "private database failure marker");
  assert.match(String(err.stack), /private database failure marker/);
  assert.equal(response.body.includes("private database failure marker"), false);
});

test("expected 4xx errors do not create error level logs; health and readiness use independent checks", async (t) => {
  const { logger, lines } = captureLogger();
  const { exams, users } = repositories();
  let readinessCalls = 0;
  const app = buildApp({
    logger,
    examRepository: exams,
    userRepository: users,
    readinessCheck: async () => { readinessCalls += 1; },
    jwtSecret,
  });
  t.after(async () => { await app.close(); logger.flush(); });

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });
  assert.equal(readinessCalls, 0);
  const unauthorized = await app.inject({ method: "GET", url: "/api/exam/banks/default" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.json().error.code, "UNAUTHORIZED");
  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json(), { status: "ready" });
  assert.equal(readinessCalls, 1);
  assert.equal(readLogs(lines).some((entry) => entry.level === 50), false);
});

test("readiness failures are logged but return a safe 503 response", async (t) => {
  const { logger, lines } = captureLogger();
  const { exams, users } = repositories();
  const app = buildApp({
    logger,
    examRepository: exams,
    userRepository: users,
    readinessCheck: async () => { throw new Error("private database connection marker"); },
    jwtSecret,
  });
  t.after(async () => { await app.close(); logger.flush(); });

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: "not_ready" });
  const readinessLog = readLogs(lines).find((entry) => entry.event === "app.readiness.failed");
  assert.ok(readinessLog);
  assert.equal(readinessLog.reqId, response.headers["x-request-id"]);
  assert.equal(response.body.includes("private database connection marker"), false);
});

test("application logger validates levels and redacts common credential fields", () => {
  const { logger, lines } = captureLogger("debug");
  assert.throws(() => createApplicationLogger({ level: "verbose" }), /Invalid LOG_LEVEL/);
  logger.info({
    authorization: "authorization-marker",
    headers: { Cookie: "cookie-marker", "set-cookie": "set-cookie-marker" },
    body: { password: "password-marker", passwordHash: "password-hash-marker", token: "token-marker" },
  }, "credential redaction check");
  const output = lines.join("");
  for (const marker of ["authorization-marker", "cookie-marker", "set-cookie-marker", "password-marker", "password-hash-marker", "token-marker"]) {
    assert.equal(output.includes(marker), false, `${marker} should be redacted`);
  }
  logger.flush();
});
