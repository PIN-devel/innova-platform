import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryCacheStore, createInMemoryDistributedLock } from "@innova/auth-kit";
import type { AuthUser } from "@innova/contracts";
import { buildApp } from "../src/app.js";
import {
  DistributedExaoneRateGate,
  ExaoneRateGate,
  OpenAiCompatibleProvider,
} from "../src/providers/index.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";

const adminUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000010",
  email: "admin@example.com",
  role: "admin",
  approvalStatus: "approved",
};

const memberUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000011",
  email: "member@example.com",
  role: "member",
  approvalStatus: "approved",
};

const rejectedAdmin: AuthUser = {
  id: "00000000-0000-4000-8000-000000000012",
  email: "rejected@example.com",
  role: "admin",
  approvalStatus: "rejected",
};

const usersMap = new Map<string, AuthUser>([
  [adminUser.id, adminUser],
  [memberUser.id, memberUser],
  [rejectedAdmin.id, rejectedAdmin],
]);

const userLookup = {
  findById: async (id: string) => usersMap.get(id),
};

function createMockSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("access control gates /api/ai/chat/stream", async (t) => {
  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
  });
  t.after(() => app.close());
  await app.ready();

  // 1. Unauthenticated
  const unauthRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    payload: { messages: [{ role: "user", content: "안녕" }] },
  });
  assert.equal(unauthRes.statusCode, 401);
  assert.equal(unauthRes.json().error.code, "UNAUTHORIZED");

  // 2. Non-admin (member)
  const memberToken = app.jwt.sign({ sub: memberUser.id });
  const memberRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${memberToken}` },
    payload: { messages: [{ role: "user", content: "안녕" }] },
  });
  assert.equal(memberRes.statusCode, 403);
  assert.equal(memberRes.json().error.code, "FORBIDDEN");

  // 3. Rejected admin
  const rejectedToken = app.jwt.sign({ sub: rejectedAdmin.id });
  const rejectedRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${rejectedToken}` },
    payload: { messages: [{ role: "user", content: "안녕" }] },
  });
  assert.equal(rejectedRes.statusCode, 403);
  assert.equal(rejectedRes.json().error.code, "SIGNUP_REJECTED");

  // 4. Cross-site request blocked (CSRF defense)
  const adminToken = app.jwt.sign({ sub: adminUser.id });
  const crossSiteRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: {
      cookie: `innova_auth=${adminToken}`,
      "sec-fetch-site": "cross-site",
    },
    payload: { messages: [{ role: "user", content: "안녕" }] },
  });
  assert.equal(crossSiteRes.statusCode, 403);
  assert.equal(crossSiteRes.json().error.code, "FORBIDDEN");
});

test("request body validation on /api/ai/chat/stream", async (t) => {
  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });

  const invalidRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [] },
  });
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(invalidRes.json().error.code, "INVALID_INPUT");
});

test("ExaoneChatProvider streams reasoning and content with stripped leading whitespace", async (t) => {
  let capturedBody: any = null;
  const mockChunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"생각하는 중..."}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"\\n\\n안녕하세요"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"! 반갑습니다."}}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const fetchImpl: typeof fetch = async (url, init) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(createMockSseStream(mockChunks), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    fetchImpl,
    apiKey: "test-api-key",
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: {
      messages: [{ role: "user", content: "안녕하세요" }],
      reasoningEffort: "high",
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/event-stream; charset=utf-8");

  // Verify parameters sent to EXAONE
  assert.equal(capturedBody.model, "k-exaone_v2.5");
  assert.equal(capturedBody.stream, true);
  assert.equal(capturedBody.temperature, 1.0);
  assert.equal(capturedBody.top_p, 0.95);
  assert.deepEqual(capturedBody.chat_template_kwargs, { preserve_thinking: false });
  assert.equal(capturedBody.reasoning_effort, "high");

  // Verify parsed SSE events
  const lines = res.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));

  assert.deepEqual(lines, [
    { type: "reasoning", delta: "생각하는 중..." },
    { type: "content", delta: "안녕하세요" }, // Leading \n\n stripped!
    { type: "content", delta: "! 반갑습니다." },
    { type: "done" },
  ]);
});

test("ExaoneChatProvider defaults reasoning_effort to low when omitted", async (t) => {
  let capturedBody: any = null;
  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-api-key",
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(createMockSseStream(["data: [DONE]\n\n"]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: {
      messages: [{ role: "user", content: "기본 추론 강도 확인" }],
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.reasoning_effort, "low");
});

test("swapping provider with generic OpenAiCompatibleProvider works seamlessly", async (t) => {
  let capturedBody: any = null;
  const mockChunks = [
    'data: {"choices":[{"delta":{"content":"Hello from generic OpenAI compatible model!"}}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const customProvider = new OpenAiCompatibleProvider({
    providerName: "custom-openai",
    modelId: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "test-custom-key",
    fetchImpl: async (url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(createMockSseStream(mockChunks), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    chatProvider: customProvider,
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: {
      messages: [{ role: "user", content: "Hello" }],
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.model, "gpt-4o-mini");

  const lines = res.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));

  assert.deepEqual(lines, [
    { type: "content", delta: "Hello from generic OpenAI compatible model!" },
    { type: "done" },
  ]);
});

test("rate limit enforces 1 RPS without queueing", async (t) => {
  const rateGate = new ExaoneRateGate(1_000);

  const fetchImpl: typeof fetch = async () => {
    return new Response(createMockSseStream(["data: [DONE]\n\n"]), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    fetchImpl,
    apiKey: "test-api-key",
    rateGate,
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });

  // First request succeeds
  const firstRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "첫 질문" }] },
  });
  assert.equal(firstRes.statusCode, 200);

  // Immediate second request fails with 429
  const secondRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "두 번째 질문" }] },
  });
  assert.equal(secondRes.statusCode, 429);
  assert.equal(secondRes.json().error.code, "RATE_LIMITED");
  assert.ok(secondRes.headers["retry-after-ms"]);
  assert.ok(secondRes.headers["retry-after"]);
});

test("upstream errors map to appropriate responses", async (t) => {
  // 1. Upstream 400 (context limit)
  const app400 = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "Context limit exceeded" }), { status: 400 }),
  });
  t.after(() => app400.close());
  await app400.ready();

  const adminToken = app400.jwt.sign({ sub: adminUser.id });
  const res400 = await app400.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "긴 프롬프트" }] },
  });
  assert.equal(res400.statusCode, 200); // SSE stream was opened
  const lines400 = res400.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
  assert.equal(lines400[0].type, "error");
  assert.equal(lines400[0].code, "INVALID_INPUT");

  // 2. Upstream 429 (rate limit)
  const app429 = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "Rate limit" }), {
        status: 429,
        headers: { "retry-after-ms": "3500" },
      }),
  });
  t.after(() => app429.close());
  await app429.ready();

  const res429 = await app429.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "빠른 질문" }] },
  });
  const lines429 = res429.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
  assert.equal(lines429[0].type, "error");
  assert.equal(lines429[0].code, "RATE_LIMITED");
  assert.equal(lines429[0].retryAfterMs, 3500);

  // 3. Unexpected system error masks internal details
  const appInternal = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    fetchImpl: async () => {
      const err = new Error("connect ECONNREFUSED 10.0.0.42:443");
      (err as any).code = "ECONNREFUSED";
      throw err;
    },
  });
  t.after(() => appInternal.close());
  await appInternal.ready();

  const resInternal = await appInternal.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "질문" }] },
  });
  const linesInternal = resInternal.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
  assert.equal(linesInternal[0].type, "error");
  assert.equal(linesInternal[0].code, "INTERNAL_ERROR");
  assert.equal(linesInternal[0].message, "AI 서비스 내부 오류가 발생했습니다.");
});

test("distributed rate gate enforces single-flight and 1-RPS across two app instances", async (t) => {
  let now = 1_000_000;
  const sharedLock = createInMemoryDistributedLock(() => now);
  const sharedCache = createInMemoryCacheStore(() => now);

  let releaseFirstStream: (() => void) | undefined;
  let firstStreamStarted!: () => void;
  const firstStreamGate = new Promise<void>((resolve) => {
    firstStreamStarted = resolve;
  });

  const sseBody = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "첫 번째 응답" } }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");

  const appA = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    cacheStore: sharedCache,
    distributedLock: sharedLock,
    rateGate: new DistributedExaoneRateGate(sharedLock, sharedCache, 1_000, 65_000, () => now),
    fetchImpl: async () => {
      firstStreamStarted();
      await new Promise<void>((resolve) => {
        releaseFirstStream = resolve;
      });
      return new Response(createMockSseStream([sseBody]), { status: 200 });
    },
  });
  const appB = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    cacheStore: sharedCache,
    distributedLock: sharedLock,
    rateGate: new DistributedExaoneRateGate(sharedLock, sharedCache, 1_000, 65_000, () => now),
    fetchImpl: async () => new Response(createMockSseStream([sseBody]), { status: 200 }),
  });

  t.after(() => Promise.all([appA.close(), appB.close()]));
  await Promise.all([appA.ready(), appB.ready()]);

  const adminToken = appA.jwt.sign({ sub: adminUser.id });

  const firstPromise = appA.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "인스턴스 A 스트림" }] },
  });

  await firstStreamGate;

  // Concurrent request arriving at instance B while A holds the distributed lock -> 429
  const blockedRes = await appB.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "인스턴스 B 동시 요청" }] },
  });
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.json().error.code, "RATE_LIMITED");
  assert.ok(blockedRes.headers["retry-after-ms"]);

  // Advance clock beyond initial 1s interval while stream A is active; release still enforces post-stream 1s cooldown
  now += 5_000;
  releaseFirstStream?.();
  const firstRes = await firstPromise;
  assert.equal(firstRes.statusCode, 200);

  const cooldownBlockedRes = await appB.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "쿨다운 중 요청" }] },
  });
  assert.equal(cooldownBlockedRes.statusCode, 429);

  now += 1_500;
  const afterCooldownRes = await appB.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "쿨다운 이후 요청" }] },
  });
  assert.equal(afterCooldownRes.statusCode, 200);
});

test("streamTimeoutMs aborts slow upstream stream, emits timeout SSE error, and releases rate gate lock", async (t) => {
  let now = 2_000_000;
  let upstreamAborted = false;
  let callCount = 0;
  const rateGate = new ExaoneRateGate(1_000, () => now);

  const app = buildApp({
    logger: false,
    userLookup,
    jwtSecret,
    apiKey: "test-key",
    rateGate,
    streamTimeoutMs: 40,
    fetchImpl: async (_url, init) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              upstreamAborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
      return new Response(createMockSseStream(["data: [DONE]\n\n"]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  t.after(() => app.close());
  await app.ready();

  const adminToken = app.jwt.sign({ sub: adminUser.id });
  const timeoutRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "느린 요청" }] },
  });

  assert.equal(timeoutRes.statusCode, 200);
  assert.equal(upstreamAborted, true);
  assert.match(timeoutRes.body, /^: stream-open/m);

  const lines = timeoutRes.body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));

  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, "error");
  assert.equal(lines[0].code, "INTERNAL_ERROR");
  assert.match(lines[0].message, /55초/);

  // Lock was released on timeout; once cooldown passes, next request succeeds
  now += 1_500;
  const followUpRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${adminToken}` },
    payload: { messages: [{ role: "user", content: "후속 요청" }] },
  });
  assert.equal(followUpRes.statusCode, 200);
});
