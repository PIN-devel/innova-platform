import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  INTERNAL_EVENT_TOKEN_HEADER,
  createInMemoryCacheStore,
  createInMemoryDeadLetterSink,
  userCacheKey,
} from "@innova/auth-kit";
import type { AuthUser, DomainEventEnvelope, PubSubPushEnvelope } from "@innova/contracts";
import { buildApp } from "../src/app.js";
import type { CurriculumReadRepository } from "../src/db/curriculum-read.js";
import type { ExamRepository } from "../src/db/exam.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const internalToken = "test-internal-event-token";
const userId = "00000000-0000-4000-8000-000000000101";

const emptyCurriculum: CurriculumReadRepository = {
  async subjects() { return []; },
  async subject() { return undefined; },
  async chapters() { return []; },
  async chapter() { return undefined; },
  async questions() { return []; },
};

const emptyExams: ExamRepository = {
  async find() { return undefined; },
  async create() {
    throw new Error("unused");
  },
};

function toPushEnvelope(event: DomainEventEnvelope, deliveryAttempt = 1): PubSubPushEnvelope {
  return {
    message: {
      data: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
      messageId: randomUUID(),
      publishTime: new Date().toISOString(),
      attributes: {
        eventId: event.eventId,
        eventType: event.eventType,
        producer: event.producer,
      },
    },
    subscription: "projects/test/subscriptions/learning-user-events",
    deliveryAttempt,
  };
}

test("learning internal event push invalidates cached user state, enforces token, and is idempotent", async (t) => {
  const cacheStore = createInMemoryCacheStore();
  const deadLetterSink = createInMemoryDeadLetterSink();
  let currentUser: AuthUser = {
    id: userId,
    email: "learner@example.com",
    role: "member",
    approvalStatus: "pending",
  };
  let lookupCalls = 0;

  const app = buildApp({
    logger: false,
    cacheStore,
    internalEventToken: internalToken,
    deadLetterSink,
    userLookup: {
      findById: async (id) => {
        lookupCalls += 1;
        return id === userId ? currentUser : undefined;
      },
    },
    examRepository: emptyExams,
    curriculumRepository: emptyCurriculum,
    jwtSecret,
  });

  t.after(() => app.close());
  await app.ready();

  // Warm cache with pending user
  const token = app.jwt.sign({ sub: userId });
  const pendingRes = await app.inject({
    method: "GET",
    url: "/api/curriculum/subjects",
    headers: { cookie: `innova_auth=${token}` },
  });
  assert.equal(pendingRes.statusCode, 403);
  assert.equal(lookupCalls, 1);
  assert.ok(await cacheStore.get(userCacheKey(userId)));

  // Reject wrong internal token
  const event: DomainEventEnvelope = {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: new Date().toISOString(),
    producer: "innova-auth-api",
    payload: {
      userId,
      email: "learner@example.com",
      previousStatus: "pending",
      currentStatus: "approved",
      role: "member",
      changedAt: new Date().toISOString(),
    },
  };
  const unauthEventRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: "wrong-token" },
    payload: toPushEnvelope(event),
  });
  assert.equal(unauthEventRes.statusCode, 401);

  // Flip upstream user status and deliver Pub/Sub push event -> cache invalidated
  currentUser = { ...currentUser, approvalStatus: "approved" };
  const okEventRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(event),
  });
  assert.equal(okEventRes.statusCode, 200);
  assert.deepEqual(okEventRes.json(), { status: "processed", eventId: event.eventId });
  assert.equal(await cacheStore.get(userCacheKey(userId)), undefined);

  // Subsequent request immediately sees approved user without waiting for TTL expiry
  const approvedRes = await app.inject({
    method: "GET",
    url: "/api/curriculum/subjects",
    headers: { cookie: `innova_auth=${token}` },
  });
  assert.equal(approvedRes.statusCode, 200);
  assert.equal(lookupCalls, 2);

  // Duplicate event delivery is idempotently ignored and keeps newly warmed cache intact
  assert.ok(await cacheStore.get(userCacheKey(userId)));
  const dupRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(event),
  });
  assert.equal(dupRes.statusCode, 200);
  assert.deepEqual(dupRes.json(), { status: "duplicate_ignored", eventId: event.eventId });
  assert.ok(await cacheStore.get(userCacheKey(userId)));

  // DLQ push records payload in DeadLetterSink
  const dlqRes = await app.inject({
    method: "POST",
    url: "/internal/events/dlq",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(event, 3),
  });
  assert.equal(dlqRes.statusCode, 202);
  const recordedDlq = await deadLetterSink.list?.();
  assert.equal(recordedDlq?.length, 1);
  assert.equal(recordedDlq?.[0]?.eventId, event.eventId);
});
