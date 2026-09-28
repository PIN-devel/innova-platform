import assert from "node:assert/strict";
import { test } from "node:test";
import { ExamBankSchema } from "@innova/contracts";
import { buildApp } from "../src/app.js";
import type { ExamRepository } from "../src/db/exam.js";
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
  const bank = ExamBankSchema.parse({
    schema: "sap-drill-bank.v1",
    subject: "Synthetic test",
    source: "test",
    generatedAt: "2026-01-01",
    concepts: [{ id: "concept-1", chapter: 1, deck: "test", term: "Placeholder", definition: "Synthetic definition", rationale: "Synthetic explanation" }],
    scenarios: [{ id: "scenario-1", chapter: 1, stem: "Synthetic prompt", choices: ["A", "B", "C"], answerIndex: 0, rationale: "Synthetic explanation" }],
  });
  const exams: ExamRepository = {
    async find(id) { return id === "aws-sap" ? { id, bank } : undefined; },
    async create(value) { return { id: "created-bank", bank: value }; },
  };
  const app = buildApp({ logger: false, examRepository: exams, userRepository: users, jwtSecret });
  const cookieFor = (id: string) => `exam_drill_auth=${app.jwt.sign({ sub: id }, { expiresIn: "15m" })}`;
  return { app, records, cookieFor };
}

test("admin approval is role-protected and activates an existing pending session", async (t) => {
  const { app, records, cookieFor } = fixture();
  t.after(() => app.close());
  await app.ready();

  const pendingCookie = cookieFor(pendingId);
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
  const unauthenticatedApproval = await app.inject({ method: "POST", url: `/api/admin/users/${pendingId}/approve` });
  assert.equal(unauthenticatedApproval.statusCode, 401);
  assert.equal(unauthenticatedApproval.json().error.code, "UNAUTHORIZED");

  const pendingExamRead = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie: pendingCookie } });
  assert.equal(pendingExamRead.statusCode, 403);
  assert.equal(pendingExamRead.json().error.code, "APPROVAL_PENDING");
  const pendingExamWrite = await app.inject({ method: "POST", url: "/api/exam/banks", headers: { cookie: pendingCookie }, payload: { schema: "bad" } });
  assert.equal(pendingExamWrite.statusCode, 403);
  assert.equal(pendingExamWrite.json().error.code, "APPROVAL_PENDING");

  const adminList = await app.inject({ method: "GET", url: "/api/admin/users/pending", headers: { cookie: adminCookie } });
  assert.equal(adminList.statusCode, 200);
  assert.deepEqual(adminList.json(), { users: [
    { id: pendingId, email: "pending@example.com", approvalStatus: "pending" },
    { id: adminId, email: "admin@example.com", approvalStatus: "pending" },
    { id: rejectionTargetId, email: "reject-target@example.com", approvalStatus: "pending" },
  ] });
  assert.equal(adminList.body.includes("private-hash"), false);

  const missing = await app.inject({ method: "POST", url: "/api/admin/users/11111111-1111-4111-8111-111111111111/approve", headers: { cookie: adminCookie } });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "NOT_FOUND");

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

  const approvedList = await app.inject({ method: "GET", url: "/api/admin/users/pending", headers: { cookie: adminCookie } });
  assert.deepEqual(approvedList.json(), { users: [
    { id: adminId, email: "admin@example.com", approvalStatus: "pending" },
    { id: rejectionTargetId, email: "reject-target@example.com", approvalStatus: "pending" },
  ] });

  // Reuse the cookie issued before approval; no login or token renewal occurs here.
  const examRead = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie: pendingCookie } });
  assert.equal(examRead.statusCode, 200);
  const examWrite = await app.inject({ method: "POST", url: "/api/exam/banks", headers: { cookie: pendingCookie }, payload: {
    schema: "sap-drill-bank.v1",
    subject: "Synthetic test",
    source: "test",
    generatedAt: "2026-01-01",
    concepts: [{ id: "concept-1", chapter: 1, deck: "test", term: "Placeholder", definition: "Synthetic definition", rationale: "Synthetic explanation" }],
    scenarios: [{ id: "scenario-1", chapter: 1, stem: "Synthetic prompt", choices: ["A", "B", "C"], answerIndex: 0, rationale: "Synthetic explanation" }],
  } });
  assert.equal(examWrite.statusCode, 201);

  const adminStillPendingExam = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie: adminCookie } });
  assert.equal(adminStillPendingExam.statusCode, 403);
  assert.equal(adminStillPendingExam.json().error.code, "APPROVAL_PENDING");

  const rejectedCookie = cookieFor(rejectedId);
  const rejectedExam = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie: rejectedCookie } });
  assert.equal(rejectedExam.statusCode, 403);
  assert.equal(rejectedExam.json().error.code, "SIGNUP_REJECTED");

  const rejected = await app.inject({ method: "POST", url: `/api/admin/users/${rejectedId}/reject`, headers: { cookie: adminCookie } });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json().error.code, "BUSINESS_RULE_VIOLATION");

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
  const rejectedPendingList = await app.inject({ method: "GET", url: "/api/admin/users/pending", headers: { cookie: adminCookie } });
  assert.deepEqual(rejectedPendingList.json(), { users: [{ id: adminId, email: "admin@example.com", approvalStatus: "pending" }] });
  const rejectionTargetCookie = cookieFor(rejectionTargetId);
  const rejectedFromExistingSession = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie: rejectionTargetCookie } });
  assert.equal(rejectedFromExistingSession.statusCode, 403);
  assert.equal(rejectedFromExistingSession.json().error.code, "SIGNUP_REJECTED");
  const missingRejection = await app.inject({ method: "POST", url: "/api/admin/users/11111111-1111-4111-8111-111111111111/reject", headers: { cookie: adminCookie } });
  assert.equal(missingRejection.statusCode, 404);
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
