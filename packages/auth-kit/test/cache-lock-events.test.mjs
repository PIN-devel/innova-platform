import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import Fastify from "fastify";
import {
  AppError,
  apiErrorBody,
  createGcpIdentityTokenProvider,
  createGcpPubSubPublisher,
  createHttpFanoutPublisher,
  createInMemoryCacheStore,
  createInMemoryDeadLetterSink,
  createInMemoryDistributedLock,
  createRemoteUserLookup,
  createUpstashRestCacheStore,
  createUpstashRestDistributedLock,
  pubSubPushRoutes,
  resolveRuntimeIdTokenProvider,
} from "../dist/index.js";

function sampleEvent(overrides = {}) {
  return {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: new Date().toISOString(),
    producer: "innova-auth-api",
    payload: {
      userId: "user-123",
      email: "member@example.com",
      previousStatus: "pending",
      currentStatus: "approved",
      role: "member",
      changedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe("CacheStore", () => {
  it("supports TTL expiration and atomic setIfAbsent in InMemoryCacheStore", async () => {
    let now = 1_000;
    const cache = createInMemoryCacheStore(() => now);

    await cache.set("auth:user:1", { approved: true }, 500);
    assert.deepEqual(await cache.get("auth:user:1"), { approved: true });

    assert.equal(await cache.setIfAbsent("idem:1", "v1", 500), true);
    assert.equal(await cache.setIfAbsent("idem:1", "v2", 500), false);

    now = 1_500;
    assert.equal(await cache.get("auth:user:1"), undefined);
    assert.equal(await cache.setIfAbsent("idem:1", "v2", 500), true);

    await cache.del("idem:1");
    assert.equal(await cache.get("idem:1"), undefined);
  });

  it("maps GET, SET NX PX, and DEL commands via Upstash REST API", async () => {
    const calls = [];
    const fetchImpl = async (_url, init) => {
      const cmd = JSON.parse(init.body);
      calls.push({ headers: init.headers, cmd });
      if (cmd[0] === "GET") {
        return new Response(JSON.stringify({ result: JSON.stringify({ id: "u1" }) }), { status: 200 });
      }
      if (cmd[0] === "SET" && cmd.includes("NX")) {
        return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    };

    const cache = createUpstashRestCacheStore({
      url: "https://example.upstash.io/",
      token: "secret-token",
      fetchImpl,
    });

    assert.deepEqual(await cache.get("k1"), { id: "u1" });
    assert.equal(await cache.setIfAbsent("k2", "done", 1_000), true);
    await cache.del("k1");

    assert.equal(calls[0].headers.authorization, "Bearer secret-token");
    assert.deepEqual(calls[0].cmd, ["GET", "k1"]);
    assert.deepEqual(calls[1].cmd, ["SET", "k2", JSON.stringify("done"), "NX", "PX", 1_000]);
    assert.deepEqual(calls[2].cmd, ["DEL", "k1"]);
  });
});

describe("DistributedLock", () => {
  it("prevents concurrent acquisition and rejects stale owner release after TTL expiration", async () => {
    let now = 10_000;
    const lock = createInMemoryDistributedLock(() => now);

    const lease1 = await lock.tryAcquire("lock:ai:stream", 1_000);
    assert.ok(lease1);
    assert.equal(await lock.tryAcquire("lock:ai:stream", 1_000), null);

    // Simulate TTL expiry and acquisition by another worker
    now = 11_001;
    const lease2 = await lock.tryAcquire("lock:ai:stream", 1_000);
    assert.ok(lease2);
    assert.notEqual(lease2.token, lease1.token);

    // Stale worker cannot delete lease2's lock
    assert.equal(await lease1.release(), false);
    assert.equal(await lock.tryAcquire("lock:ai:stream", 1_000), null);

    // Valid owner releases cleanly
    assert.equal(await lease2.release(), true);
    const lease3 = await lock.tryAcquire("lock:ai:stream", 1_000);
    assert.ok(lease3);
    await lease3.release();
  });

  it("uses SET NX PX and owner-checked Lua EVAL on Upstash REST lock", async () => {
    const commands = [];
    const fetchImpl = async (_url, init) => {
      const cmd = JSON.parse(init.body);
      commands.push(cmd);
      if (cmd[0] === "SET") {
        return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
      }
      if (cmd[0] === "EVAL") {
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    };

    const lock = createUpstashRestDistributedLock({
      url: "https://example.upstash.io",
      token: "tok",
      fetchImpl,
    });

    const result = await lock.withLock("lock:resource", 2_500, async () => "ok");
    assert.deepEqual(result, { acquired: true, value: "ok" });
    assert.equal(commands[0][0], "SET");
    assert.equal(commands[0][1], "lock:resource");
    assert.equal(commands[0][3], "NX");
    assert.equal(commands[0][4], "PX");
    assert.equal(commands[0][5], 2_500);
    assert.equal(commands[1][0], "EVAL");
    assert.equal(commands[1][4], commands[0][2]);
  });
});

describe("EventPublisher, Fan-out Push, Idempotency & DLQ", () => {
  async function createConsumerApp({ consumerName, internalToken, onEvent, cacheStore = createInMemoryCacheStore(), deadLetterSink }) {
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _req, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(apiErrorBody(error));
      }
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal error" } });
    });
    app.register(pubSubPushRoutes, {
      prefix: "/internal/events",
      consumerName,
      cacheStore,
      internalToken,
      deadLetterSink,
      onEvent,
    });
    await app.ready();
    return app;
  }

  it("publishes base64 payload to GCP Pub/Sub REST endpoint with ADC token", async () => {
    let captured;
    const publisher = createGcpPubSubPublisher({
      projectId: "innova-proj",
      topicId: "innova-user-events",
      tokenProvider: async () => "adc-token-1",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ messageIds: ["msg-999"] }), { status: 200 });
      },
    });

    const event = sampleEvent();
    const res = await publisher.publish(event);
    assert.equal(res.messageId, "msg-999");
    assert.equal(
      captured.url,
      "https://pubsub.googleapis.com/v1/projects/innova-proj/topics/innova-user-events:publish",
    );
    assert.equal(captured.headers.authorization, "Bearer adc-token-1");
    const decoded = JSON.parse(Buffer.from(captured.body.messages[0].data, "base64").toString("utf8"));
    assert.deepEqual(decoded, event);
  });

  it("fans out 1:N, enforces idempotency, retries transient failure, and moves exhausted failures to DLQ", async () => {
    const received = { learning: [], finance: [], ai: [] };
    let financeFailuresRemaining = 2;
    const dlq = createInMemoryDeadLetterSink();
    const token = "internal-secret-token";

    const learningApp = await createConsumerApp({
      consumerName: "learning",
      internalToken: token,
      onEvent: async (ev) => {
        received.learning.push(ev.eventId);
      },
    });
    const financeApp = await createConsumerApp({
      consumerName: "finance",
      internalToken: token,
      onEvent: async (ev) => {
        if (financeFailuresRemaining > 0) {
          financeFailuresRemaining -= 1;
          throw new Error("transient DB timeout");
        }
        received.finance.push(ev.eventId);
      },
    });
    const aiApp = await createConsumerApp({
      consumerName: "ai",
      internalToken: token,
      onEvent: async (ev) => {
        if (ev.payload.userId === "always-fail") {
          throw new Error("permanent downstream failure");
        }
        received.ai.push(ev.eventId);
      },
    });

    const appMap = new Map([
      ["http://learning.local/internal/events/user-status", learningApp],
      ["http://finance.local/internal/events/user-status", financeApp],
      ["http://ai.local/internal/events/user-status", aiApp],
    ]);

    const fetchImpl = async (url, init) => {
      const app = appMap.get(String(url));
      const res = await app.inject({
        method: "POST",
        url: "/internal/events/user-status",
        headers: init.headers,
        payload: JSON.parse(init.body),
      });
      return new Response(res.body, { status: res.statusCode, headers: { "content-type": "application/json" } });
    };

    const publisher = createHttpFanoutPublisher({
      subscribers: [
        { subscription: "sub-learning", url: "http://learning.local/internal/events/user-status" },
        { subscription: "sub-finance", url: "http://finance.local/internal/events/user-status" },
        { subscription: "sub-ai", url: "http://ai.local/internal/events/user-status" },
      ],
      internalToken: token,
      fetchImpl,
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: async () => {},
      deadLetterSink: dlq,
    });

    // 1. Fan-out + retry recovery on finance
    const event1 = sampleEvent();
    await publisher.publish(event1);
    assert.deepEqual(received.learning, [event1.eventId]);
    assert.deepEqual(received.finance, [event1.eventId]);
    assert.deepEqual(received.ai, [event1.eventId]);
    assert.equal((await dlq.list()).length, 0);

    // 2. Duplicate delivery is idempotently ignored
    await publisher.publish(event1);
    assert.deepEqual(received.learning, [event1.eventId]);
    assert.deepEqual(received.finance, [event1.eventId]);
    assert.deepEqual(received.ai, [event1.eventId]);

    // 3. Exhausted consumer failure goes to DLQ without blocking healthy consumers
    const event2 = sampleEvent({
      payload: {
        userId: "always-fail",
        email: "fail@example.com",
        previousStatus: "pending",
        currentStatus: "rejected",
        role: "member",
        changedAt: new Date().toISOString(),
      },
    });
    await publisher.publish(event2);
    assert.deepEqual(received.learning, [event1.eventId, event2.eventId]);
    assert.deepEqual(received.finance, [event1.eventId, event2.eventId]);
    assert.deepEqual(received.ai, [event1.eventId]);

    const dlqEntries = await dlq.list();
    assert.equal(dlqEntries.length, 1);
    assert.equal(dlqEntries[0].eventId, event2.eventId);
    assert.equal(dlqEntries[0].subscription, "sub-ai");
    assert.equal(dlqEntries[0].attempts, 3);

    // 4. Rejects missing or wrong internal token
    const unauthorized = await learningApp.inject({
      method: "POST",
      url: "/internal/events/user-status",
      headers: { "x-internal-event-token": "wrong" },
      payload: {},
    });
    assert.equal(unauthorized.statusCode, 401);

    await Promise.all([learningApp.close(), financeApp.close(), aiApp.close()]);
  });
});

function createFakeJwtWithExp(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, aud: "https://auth.example.run.app" })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("GCP OIDC Identity Token Provider & RemoteUserLookup", () => {
  it("normalizes audience origin, caches OIDC ID tokens until exp safety margin, and supports reset", async () => {
    let now = 1_000_000; // 1000s
    let fetchCount = 0;
    const requestedUrls = [];
    const requestedHeaders = [];
    const jwt1 = createFakeJwtWithExp(1_300); // exp at 1300s -> cached until 1240s
    const jwt2 = createFakeJwtWithExp(2_000);

    const provider = createGcpIdentityTokenProvider({
      now: () => now,
      fetchImpl: async (url, init) => {
        fetchCount += 1;
        requestedUrls.push(String(url));
        requestedHeaders.push(init.headers);
        if (fetchCount === 1) {
          return new Response(`${jwt1}\n`, { status: 200 });
        }
        return new Response(jwt2, { status: 200 });
      },
    });

    const t1 = await provider("https://auth.example.run.app/api/auth/me");
    assert.equal(t1, jwt1);
    assert.equal(
      requestedUrls[0],
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fauth.example.run.app",
    );
    assert.equal(requestedHeaders[0]["Metadata-Flavor"], "Google");

    // Same origin with different path hits cache
    now = 1_100_000;
    const t2 = await provider("https://auth.example.run.app/api/auth/login");
    assert.equal(t2, jwt1);
    assert.equal(fetchCount, 1);

    // Within safety margin (1240s), triggers refresh
    now = 1_240_000;
    const t3 = await provider("https://auth.example.run.app");
    assert.equal(t3, jwt2);
    assert.equal(fetchCount, 2);

    // Reset clears cached token
    provider.reset("https://auth.example.run.app/other");
    const t4 = await provider("https://auth.example.run.app");
    assert.equal(t4, jwt2);
    assert.equal(fetchCount, 3);
  });

  it("throws when metadata server returns error status or empty token", async () => {
    const errorProvider = createGcpIdentityTokenProvider({
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    });
    await assert.rejects(() => errorProvider("https://auth.example.run.app"), /status 403/);

    const emptyProvider = createGcpIdentityTokenProvider({
      fetchImpl: async () => new Response("   ", { status: 200 }),
    });
    await assert.rejects(() => emptyProvider("https://auth.example.run.app"), /empty identity token/);
  });

  it("injects X-Serverless-Authorization and Authorization headers when IAM auth is enabled and skips metadata when disabled", async () => {
    const calls = [];
    const lookupEnabled = createRemoteUserLookup({
      authServiceUrl: "https://auth.example.run.app",
      signSessionToken: (id) => `session-${id}`,
      enableIamAuth: true,
      fetchImpl: async (url, init) => {
        const strUrl = String(url);
        calls.push({ url: strUrl, headers: init?.headers ?? {} });
        if (strUrl.startsWith("http://metadata.google.internal/")) {
          return new Response(createFakeJwtWithExp(Math.floor(Date.now() / 1000) + 600), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "u1@example.com", approvalStatus: "approved", role: "member" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const user = await lookupEnabled.findById("u1");
    assert.equal(user?.id, "u1");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes("metadata.google.internal"));
    assert.equal(calls[1].url, "https://auth.example.run.app/api/auth/me");
    assert.match(calls[1].headers["x-serverless-authorization"], /^Bearer /);
    assert.equal(calls[1].headers["authorization"], calls[1].headers["x-serverless-authorization"]);
    assert.equal(calls[1].headers.cookie, "innova_auth=session-u1");

    // Second call reuses cached ID token without hitting metadata server again
    await lookupEnabled.findById("u1");
    assert.equal(calls.length, 3);

    // Local/disabled mode makes zero metadata calls
    const localCalls = [];
    const lookupDisabled = createRemoteUserLookup({
      authServiceUrl: "http://127.0.0.1:3001",
      signSessionToken: (id) => `session-${id}`,
      enableIamAuth: false,
      fetchImpl: async (url, init) => {
        localCalls.push({ url: String(url), headers: init?.headers ?? {} });
        return new Response(JSON.stringify({ user: { id: "u2", email: "u2@example.com", approvalStatus: "approved", role: "member" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const localUser = await lookupDisabled.findById("u2");
    assert.equal(localUser?.id, "u2");
    assert.equal(localCalls.length, 1);
    assert.equal(localCalls[0].headers["x-serverless-authorization"], undefined);
    assert.equal(resolveRuntimeIdTokenProvider({ enableIamAuth: false, targetUrl: "https://auth.example.run.app" }), undefined);
  });
});
