import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INTERNAL_EVENT_TOKEN_HEADER,
  createHttpFanoutPublisher,
  createInMemoryDeadLetterSink,
  createInMemoryDistributedLock,
  decodePubSubEvent,
  type PubSubPushEnvelope,
} from "@innova/auth-kit";
import { buildApp } from "../src/app.js";
import type { UserRecord, UserRepository } from "../src/db/users.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const pendingId = "f5f8301d-996b-461b-95c9-9a72162023d6";
const memberId = "be016cb7-11c1-49c0-b899-809e5d9f34bc";
const adminId = "408313a2-d56e-4238-a6ee-30ac46ad19a5";
const rejectedId = "5a1d69e2-5631-4a47-90e0-564fcac75000";
const rejectionTargetId = "99e80a77-411d-405a-9b69-060fd7deceda";

function fixture() {
  const records = new Map<string, UserRecord>([
    [pendingId, { id: pendingId, email: "pending@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "member" }],
    [memberId, { id: memberId, email: "member@example.com", passwordHash: "private-hash", approvalStatus: "approved", role: "member" }],
    [adminId, { id: adminId, email: "admin@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "admin" }],
    [rejectedId, { id: rejectedId, email: "rejected@example.com", passwordHash: "private-hash", approvalStatus: "rejected", role: "member" }],
    [rejectionTargetId, { id: rejectionTargetId, email: "reject-target@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "member" }],
  ]);
  const users: UserRepository = {
    async findById(id) { return records.get(id); },
    async findByEmail(email) { return [...records.values()].find((user) => user.email === email); },
    async create() { return undefined; },
    async findPending() {
      return [...records.values()].filter((user) => user.approvalStatus === "pending")
        .map(({ id, email, approvalStatus }) => ({ id, email, approvalStatus }));
    },
    async approvePending(id) {
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const approved = { ...user, approvalStatus: "approved" as const };
      records.set(id, approved);
      return approved;
    },
    async rejectPending(id) {
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const rejected = { ...user, approvalStatus: "rejected" as const };
      records.set(id, rejected);
      return rejected;
    },
  };
  const app = buildApp({ logger: false, userRepository: users, jwtSecret });
  const cookieFor = (id: string) => `innova_auth=${app.jwt.sign({ sub: id }, { expiresIn: "15m" })}`;
  return { app, records, cookieFor };
}

test("admin approval is role-protected and activates an existing pending session", async (t) => {
  const { app, records, cookieFor } = fixture();
  t.after(() => app.close());
  await app.ready();

  const memberCookie = cookieFor(memberId);
  const adminCookie = cookieFor(adminId);

  const unauthenticatedList = await app.inject({ method: "GET", url: "/api/admin/users/pending" });
  assert.equal(unauthenticatedList.statusCode, 401);
  assert.equal(unauthenticatedList.json().error.code, "UNAUTHORIZED");

  const memberList = await app.inject({ method: "GET", url: "/api/admin/users/pending", headers: { cookie: memberCookie } });
  assert.equal(memberList.statusCode, 403);
  assert.equal(memberList.json().error.code, "FORBIDDEN");

  const memberApproval = await app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/approve`, headers: { cookie: memberCookie } });
  assert.equal(memberApproval.statusCode, 403);
  assert.equal(memberApproval.json().error.code, "FORBIDDEN");

  const adminList = await app.inject({ method: "GET", url: "/api/admin/users/pending", headers: { cookie: adminCookie } });
  assert.equal(adminList.statusCode, 200);
  assert.deepEqual(adminList.json(), { users: [
    { id: pendingId, email: "pending@example.com", approvalStatus: "pending" },
    { id: adminId, email: "admin@example.com", approvalStatus: "pending" },
    { id: rejectionTargetId, email: "reject-target@example.com", approvalStatus: "pending" },
  ] });

  const approvalUrl = `/api/admin/users/${pendingId}/approve`;
  const approved = await app.inject({ method: "POST", url: approvalUrl, headers: { cookie: adminCookie } });
  assert.equal(approved.statusCode, 200);
  assert.deepEqual(approved.json().user, {
    id: pendingId,
    email: "pending@example.com",
    approvalStatus: "approved",
    role: "member",
  });
  assert.equal(records.get(pendingId)?.role, "member");

  const repeatedApproval = await app.inject({ method: "POST", url: approvalUrl, headers: { cookie: adminCookie } });
  assert.equal(repeatedApproval.statusCode, 200);
  assert.deepEqual(repeatedApproval.json(), approved.json());

  const rejectionUrl = `/api/admin/users/${rejectionTargetId}/reject`;
  const rejection = await app.inject({ method: "POST", url: rejectionUrl, headers: { cookie: adminCookie } });
  assert.equal(rejection.statusCode, 200);
  assert.deepEqual(rejection.json().user, {
    id: rejectionTargetId,
    email: "reject-target@example.com",
    approvalStatus: "rejected",
    role: "member",
  });
  assert.equal(records.get(rejectionTargetId)?.approvalStatus, "rejected");
});

test("rejection cannot be undone by stale approval, and rejected admins lose every admin endpoint", async (t) => {
  const { app, records, cookieFor } = fixture();
  t.after(() => app.close());
  await app.ready();

  const headers = { cookie: cookieFor(adminId) };
  const staleApproval = await app.inject({ method: "POST", url: `/api/admin/users/${rejectedId}/approve`, headers });
  assert.equal(staleApproval.statusCode, 409);
  assert.equal(staleApproval.json().error.code, "BUSINESS_RULE_VIOLATION");
  assert.equal(records.get(rejectedId)?.approvalStatus, "rejected");

  records.set(adminId, { ...records.get(adminId)!, approvalStatus: "rejected" });
  for (const [method, url] of [
    ["GET", "/api/admin/users/pending"],
    ["POST", `/api/admin/users/${pendingId}/approve`],
    ["POST", `/api/admin/users/${pendingId}/reject`],
  ] as const) {
    const response = await app.inject({ method, url, headers });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "SIGNUP_REJECTED");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});

test("distributed lock returns 409 CONFLICT when another admin status transition holds the lock", async (t) => {
  const lock = createInMemoryDistributedLock();
  let releaseApprove!: () => void;
  let approveEntered!: () => void;
  const approveEnteredPromise = new Promise<void>((resolve) => {
    approveEntered = resolve;
  });

  const records = new Map<string, UserRecord>([
    [pendingId, { id: pendingId, email: "pending@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "member" }],
    [adminId, { id: adminId, email: "admin@example.com", passwordHash: "private-hash", approvalStatus: "approved", role: "admin" }],
  ]);
  const users: UserRepository = {
    async findById(id) { return records.get(id); },
    async findByEmail(email) { return [...records.values()].find((user) => user.email === email); },
    async create() { return undefined; },
    async findPending() { return []; },
    async approvePending(id) {
      approveEntered();
      await new Promise<void>((resolve) => {
        releaseApprove = resolve;
      });
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const approved = { ...user, approvalStatus: "approved" as const };
      records.set(id, approved);
      return approved;
    },
    async rejectPending(id) {
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const rejected = { ...user, approvalStatus: "rejected" as const };
      records.set(id, rejected);
      return rejected;
    },
  };

  const app = buildApp({ logger: false, userRepository: users, distributedLock: lock, jwtSecret });
  t.after(() => app.close());
  await app.ready();

  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: adminId }, { expiresIn: "15m" })}` };
  const inFlightApprove = app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/approve`, headers });
  await approveEnteredPromise;

  const concurrentReject = await app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/reject`, headers });
  assert.equal(concurrentReject.statusCode, 409);
  assert.equal(concurrentReject.json().error.code, "CONFLICT");

  releaseApprove();
  const approveRes = await inFlightApprove;
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json().user.approvalStatus, "approved");
});

test("admin approval and rejection fan out status-changed events 1:N, tolerate publish failure, and isolate failing subscribers to DLQ", async (t) => {
  const internalToken = "fanout-secret-token";
  const deadLetterSink = createInMemoryDeadLetterSink();
  const deliveredByTarget = new Map<string, string[]>([
    ["learning", []],
    ["finance", []],
    ["ai", []],
  ]);
  let failFinance = false;

  const publisher = createHttpFanoutPublisher({
    subscribers: [
      { subscription: "sub-learning", url: "http://learning.internal/internal/events/user-status" },
      { subscription: "sub-finance", url: "http://finance.internal/internal/events/user-status" },
      { subscription: "sub-ai", url: "http://ai.internal/internal/events/user-status" },
    ],
    internalToken,
    maxAttempts: 3,
    baseDelayMs: 1,
    sleep: async () => undefined,
    deadLetterSink,
    fetchImpl: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get(INTERNAL_EVENT_TOKEN_HEADER), internalToken);

      const envelope = JSON.parse(String(init?.body)) as PubSubPushEnvelope;
      const event = decodePubSubEvent(envelope);

      if (url.includes("finance.internal") && failFinance) {
        return new Response(JSON.stringify({ error: "transient outage" }), { status: 503 });
      }
      const target = url.includes("learning.internal")
        ? "learning"
        : url.includes("finance.internal")
          ? "finance"
          : "ai";
      deliveredByTarget.get(target)?.push(`${event.eventId}:${event.payload.userId}:${event.payload.currentStatus}`);
      return new Response(JSON.stringify({ status: "processed" }), { status: 200 });
    },
  });

  const records = new Map<string, UserRecord>([
    [pendingId, { id: pendingId, email: "pending@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "member" }],
    [rejectionTargetId, { id: rejectionTargetId, email: "reject@example.com", passwordHash: "private-hash", approvalStatus: "pending", role: "member" }],
    [adminId, { id: adminId, email: "admin@example.com", passwordHash: "private-hash", approvalStatus: "approved", role: "admin" }],
  ]);
  const users: UserRepository = {
    async findById(id) { return records.get(id); },
    async findByEmail(email) { return [...records.values()].find((user) => user.email === email); },
    async create() { return undefined; },
    async findPending() { return []; },
    async approvePending(id) {
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const approved = { ...user, approvalStatus: "approved" as const };
      records.set(id, approved);
      return approved;
    },
    async rejectPending(id) {
      const user = records.get(id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const rejected = { ...user, approvalStatus: "rejected" as const };
      records.set(id, rejected);
      return rejected;
    },
  };

  const app = buildApp({
    logger: false,
    userRepository: users,
    eventPublisher: publisher,
    jwtSecret,
  });
  t.after(() => app.close());
  await app.ready();

  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: adminId }, { expiresIn: "15m" })}` };

  // 1. Approve fans out once to all 3 subscribers; repeated approve skips duplicate publish
  const approveRes = await app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/approve`, headers });
  assert.equal(approveRes.statusCode, 200);
  const repeatRes = await app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/approve`, headers });
  assert.equal(repeatRes.statusCode, 200);

  for (const target of ["learning", "finance", "ai"]) {
    assert.equal(deliveredByTarget.get(target)?.length, 1);
    assert.ok(deliveredByTarget.get(target)?.[0]?.endsWith(`:${pendingId}:approved`));
  }

  // 2. Partial consumer outage (finance 503): learning & ai still receive rejection, finance dead-lettered after retries
  failFinance = true;
  const rejectRes = await app.inject({ method: "POST", url: `/api/admin/users/${rejectionTargetId}/reject`, headers });
  assert.equal(rejectRes.statusCode, 200);

  assert.equal(deliveredByTarget.get("learning")?.length, 2);
  assert.equal(deliveredByTarget.get("ai")?.length, 2);
  assert.equal(deliveredByTarget.get("finance")?.length, 1);
  const deadLetters = await deadLetterSink.list?.();
  assert.equal(deadLetters?.length, 1);
  assert.equal(deadLetters?.[0]?.subscription, "sub-finance");
  assert.equal(deadLetters?.[0]?.attempts, 3);
});
