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
import type { PdfPasswordRepository } from "../src/db/finance-pdf-password.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const internalToken = "test-internal-event-token";
const userId = "00000000-0000-4000-8000-000000000202";

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
    subscription: "projects/test/subscriptions/finance-user-events",
    deliveryAttempt,
  };
}

function createMockPdfPasswordRepo(options: { failRevoke?: boolean } = {}): {
  repo: PdfPasswordRepository;
  revokedOwnerIds: string[];
} {
  const revokedOwnerIds: string[] = [];
  const repo: PdfPasswordRepository = {
    status: async () => ({
      stored: false,
      revision: 0,
      updatedAt: null,
      available: false,
      canUse: false,
      reauthRequired: true,
    }),
    begin: async () => {
      throw new Error("unused");
    },
    save: async () => {
      throw new Error("unused");
    },
    reveal: async () => {
      throw new Error("unused");
    },
    remove: async () => {
      throw new Error("unused");
    },
    rotate: async () => {
      throw new Error("unused");
    },
    revokePendingAttempts: async (ownerId) => {
      if (options.failRevoke) {
        throw new Error("Simulated finance DB connection drop");
      }
      revokedOwnerIds.push(ownerId);
      return 1;
    },
  };
  return { repo, revokedOwnerIds };
}

test("finance internal event consumer invalidates cache, revokes unconsumed PDF attempts on rejection, and dead-letters repeated failures", async (t) => {
  const cacheStore = createInMemoryCacheStore();
  const deadLetterSink = createInMemoryDeadLetterSink();
  const user: AuthUser = {
    id: userId,
    email: "finance@example.com",
    role: "member",
    approvalStatus: "approved",
  };
  const { repo, revokedOwnerIds } = createMockPdfPasswordRepo();

  const app = buildApp({
    logger: false,
    cacheStore,
    internalEventToken: internalToken,
    deadLetterSink,
    financePdfPasswordRepository: repo,
    userLookup: {
      findById: async (id) => (id === userId ? user : undefined),
    },
    jwtSecret,
  });

  t.after(() => app.close());
  await app.ready();

  // Unauthorized push fails with 401
  const approvedEvent: DomainEventEnvelope = {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: new Date().toISOString(),
    producer: "innova-auth-api",
    payload: {
      userId,
      email: "finance@example.com",
      previousStatus: "pending",
      currentStatus: "approved",
      role: "member",
      changedAt: new Date().toISOString(),
    },
  };
  const unauthRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    payload: toPushEnvelope(approvedEvent),
  });
  assert.equal(unauthRes.statusCode, 401);

  // Approved event invalidates user cache without revoking PDF attempts
  await cacheStore.set(userCacheKey(userId), user, 60_000);
  const approvedRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(approvedEvent),
  });
  assert.equal(approvedRes.statusCode, 200);
  assert.equal(await cacheStore.get(userCacheKey(userId)), undefined);
  assert.deepEqual(revokedOwnerIds, []);

  // Rejected event invalidates cache AND revokes unconsumed PDF password attempts once
  await cacheStore.set(userCacheKey(userId), user, 60_000);
  const rejectedEvent: DomainEventEnvelope = {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: new Date().toISOString(),
    producer: "innova-auth-api",
    payload: {
      userId,
      email: "finance@example.com",
      previousStatus: "pending",
      currentStatus: "rejected",
      role: "member",
      changedAt: new Date().toISOString(),
    },
  };
  const rejectedRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(rejectedEvent),
  });
  assert.equal(rejectedRes.statusCode, 200);
  assert.equal(await cacheStore.get(userCacheKey(userId)), undefined);
  assert.deepEqual(revokedOwnerIds, [userId]);

  // Duplicate rejected event does not revoke twice
  const dupRejectedRes = await app.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(rejectedEvent),
  });
  assert.equal(dupRejectedRes.statusCode, 200);
  assert.equal(dupRejectedRes.json().status, "duplicate_ignored");
  assert.deepEqual(revokedOwnerIds, [userId]);

  // Consumer failure retries with 503 on early attempts and dead-letters at attempt >= 3
  const { repo: failingRepo } = createMockPdfPasswordRepo({ failRevoke: true });
  const failingDlq = createInMemoryDeadLetterSink();
  const failingApp = buildApp({
    logger: false,
    cacheStore: createInMemoryCacheStore(),
    internalEventToken: internalToken,
    deadLetterSink: failingDlq,
    financePdfPasswordRepository: failingRepo,
    userLookup: {
      findById: async (id) => (id === userId ? user : undefined),
    },
    jwtSecret,
  });
  t.after(() => failingApp.close());
  await failingApp.ready();

  const failingEvent: DomainEventEnvelope = {
    ...rejectedEvent,
    eventId: randomUUID(),
  };
  const retryRes = await failingApp.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(failingEvent, 1),
  });
  assert.equal(retryRes.statusCode, 503);
  assert.equal((await failingDlq.list?.())?.length, 0);

  const deadLetterRes = await failingApp.inject({
    method: "POST",
    url: "/internal/events/user-status",
    headers: { [INTERNAL_EVENT_TOKEN_HEADER]: internalToken },
    payload: toPushEnvelope(failingEvent, 5),
  });
  assert.equal(deadLetterRes.statusCode, 202);
  assert.equal(deadLetterRes.json().status, "dead_lettered");
  const deadLetters = await failingDlq.list?.();
  assert.equal(deadLetters?.length, 1);
  assert.equal(deadLetters?.[0]?.eventId, failingEvent.eventId);
});
