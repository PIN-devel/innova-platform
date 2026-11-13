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

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const internalToken = "test-internal-event-token";
const adminId = "00000000-0000-4000-8000-000000000303";

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
    subscription: "projects/test/subscriptions/ai-user-events",
    deliveryAttempt,
  };
}

test("ai internal event push invalidates cached admin status immediately and guards duplicates", async (t) => {
  const cacheStore = createInMemoryCacheStore();
  const deadLetterSink = createInMemoryDeadLetterSink();
  let currentUser: AuthUser = {
    id: adminId,
    email: "admin@example.com",
    role: "admin",
    approvalStatus: "approved",
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
        return id === adminId ? currentUser : undefined;
      },
    },
    jwtSecret,
  });

  t.after(() => app.close());
  await app.ready();

  // Unauthorized push rejected
  const event: DomainEventEnvelope = {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: new Date().toISOString(),
    producer: "innova-auth-api",
    payload: {
      userId: adminId,
      email: "admin@example.com",
      previousStatus: "approved",
      currentStatus: "rejected",
      role: "admin",
      changedAt: new Date().toISOString(),
    },
  };
  const unauthRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: "invalid" },
    payload: toPushEnvelope(event),
  });
  assert.equal(unauthRes.statusCode, 401);

  // Cache user lookup entry, then reject user upstream and invalidate via push webhook
  await cacheStore.set(userCacheKey(adminId), currentUser, 60_000);
  currentUser = { ...currentUser, approvalStatus: "rejected" };

  const okRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(event),
  });
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.json().status, "processed");
  assert.equal(await cacheStore.get(userCacheKey(adminId)), undefined);

  // Next AI request observes SIGNUP_REJECTED without stale cache
  const token = app.jwt.sign({ sub: adminId });
  const deniedRes = await app.inject({
    method: "POST",
    url: "/api/ai/chat/stream",
    headers: { cookie: `innova_auth=${token}` },
    payload: { messages: [{ role: "user", content: "안녕" }] },
  });
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(deniedRes.json().error.code, "SIGNUP_REJECTED");
  assert.equal(lookupCalls, 1);

  // Duplicate event ignored
  const dupRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(event),
  });
  assert.equal(dupRes.statusCode, 200);
  assert.equal(dupRes.json().status, "duplicate_ignored");
});
