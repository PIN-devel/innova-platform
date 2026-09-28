import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { adminApprovalResponseSchema, adminRejectionResponseSchema, apiErrorResponseSchema, authResponseSchema, pendingUsersResponseSchema } from "@innova/contracts";
import { setupServer } from "msw/node";
import { handlers, resetAuthMock } from "../src/mocks/handlers.ts";

const server = setupServer(...handlers);
const baseUrl = "http://localhost";

before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());
beforeEach(() => resetAuthMock());

function authRequest(path, method = "GET", body) {
  return fetch(`${baseUrl}/api/auth${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function errorCode(response) {
  return apiErrorResponseSchema.parse(await response.json()).error.code;
}

test("MSW signup validates, prevents duplicates, auto-authenticates, and resets", async () => {
  const signup = await authRequest("/signup", "POST", { email: "New@Example.com", password: "password123" });
  assert.equal(signup.status, 201);
  const user = authResponseSchema.parse(await signup.json()).user;
  assert.equal(user.email, "new@example.com");
  assert.deepEqual(Object.keys(user).sort(), ["approvalStatus", "email", "id", "role"]);
  assert.equal(user.approvalStatus, "pending");
  assert.equal(user.role, "member");

  const blockedExam = await fetch(`${baseUrl}/api/exam/banks/default`);
  assert.equal(blockedExam.status, 403);
  assert.equal(await errorCode(blockedExam), "APPROVAL_PENDING");

  const duplicate = await authRequest("/signup", "POST", { email: "new@example.com", password: "password123" });
  assert.equal(duplicate.status, 409);
  assert.equal(await errorCode(duplicate), "EMAIL_ALREADY_EXISTS");

  const me = await authRequest("/me");
  assert.deepEqual(authResponseSchema.parse(await me.json()).user, user);

  const invalid = await authRequest("/signup", "POST", { email: "bad", password: "short" });
  assert.equal(invalid.status, 400);
  const invalidPayload = apiErrorResponseSchema.parse(await invalid.json());
  assert.equal(invalidPayload.error.code, "INVALID_INPUT");
  assert.ok(invalidPayload.error.details.some((detail) => detail.field === "email" && detail.reason === "invalid_format"));

  resetAuthMock();
  const signedOut = await authRequest("/me");
  assert.equal(signedOut.status, 401);
  assert.equal(await errorCode(signedOut), "UNAUTHORIZED");
});

test("MSW pending login preserves the pending status and blocks exam reads and writes", async () => {
  await authRequest("/signup", "POST", { email: "pending@example.com", password: "password123" });
  await authRequest("/logout", "POST", {});

  const login = await authRequest("/login", "POST", { email: "pending@example.com", password: "password123" });
  assert.equal(login.status, 200);
  assert.equal(authResponseSchema.parse(await login.json()).user.approvalStatus, "pending");

  for (const response of [
    await fetch(`${baseUrl}/api/exam/banks/default`),
    await fetch(`${baseUrl}/api/exam/banks`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  ]) {
    assert.equal(response.status, 403);
    assert.equal(await errorCode(response), "APPROVAL_PENDING");
  }
});

test("MSW admin list and approval mirror backend authorization and state changes", async () => {
  const admin = {
    id: "00000000-0000-4000-8000-000000000002",
    email: "admin@example.com",
    approvalStatus: "pending",
    role: "admin",
  };
  resetAuthMock([{ user: admin, password: "password123" }]);

  const signup = await authRequest("/signup", "POST", { email: "member@example.com", password: "password123" });
  const member = authResponseSchema.parse(await signup.json()).user;
  const deniedList = await fetch(`${baseUrl}/api/admin/users/pending`);
  assert.equal(deniedList.status, 403);
  assert.equal(await errorCode(deniedList), "FORBIDDEN");

  await authRequest("/logout", "POST", {});
  await authRequest("/login", "POST", { email: "admin@example.com", password: "password123" });
  const list = await fetch(`${baseUrl}/api/admin/users/pending`);
  assert.equal(list.status, 200);
  const pendingUsers = pendingUsersResponseSchema.parse(await list.json()).users;
  assert.equal(pendingUsers.some((user) => user.id === member.id), true);
  assert.equal(JSON.stringify(pendingUsers).includes("password"), false);

  const approval = await fetch(`${baseUrl}/api/admin/users/${member.id}/approve`, { method: "POST" });
  assert.equal(approval.status, 200);
  assert.deepEqual(adminApprovalResponseSchema.parse(await approval.json()).user, {
    ...member,
    approvalStatus: "approved",
  });
  assert.equal((await fetch(`${baseUrl}/api/admin/users/${member.id}/approve`, { method: "POST" })).status, 200);

  const refreshedList = pendingUsersResponseSchema.parse(await (await fetch(`${baseUrl}/api/admin/users/pending`)).json()).users;
  assert.equal(refreshedList.some((user) => user.id === member.id), false);

  await authRequest("/logout", "POST", {});
  await authRequest("/login", "POST", { email: "member@example.com", password: "password123" });
  assert.equal(authResponseSchema.parse(await (await authRequest("/me")).json()).user.approvalStatus, "approved");
  assert.equal((await fetch(`${baseUrl}/api/exam/banks/default`)).status, 200);
  const examWrite = await fetch(`${baseUrl}/api/exam/banks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema: "sap-drill-bank.v1",
      subject: "Synthetic test",
      source: "test",
      generatedAt: "2026-01-01",
      concepts: [{ id: "concept-1", chapter: 1, deck: "test", term: "Placeholder", definition: "Synthetic definition", rationale: "Synthetic explanation" }],
      scenarios: [{ id: "scenario-1", chapter: 1, stem: "Synthetic prompt", choices: ["A", "B", "C"], answerIndex: 0, rationale: "Synthetic explanation" }],
    }),
  });
  assert.equal(examWrite.status, 201);
});

test("MSW admin rejection preserves rejected accounts and blocks service access", async () => {
  const admin = { id: "00000000-0000-4000-8000-000000000002", email: "admin@example.com", approvalStatus: "pending", role: "admin" };
  resetAuthMock([{ user: admin, password: "password123" }]);
  await authRequest("/signup", "POST", { email: "rejected@example.com", password: "password123" });
  await authRequest("/logout", "POST", {});
  await authRequest("/login", "POST", { email: "admin@example.com", password: "password123" });

  const pending = pendingUsersResponseSchema.parse(await (await fetch(`${baseUrl}/api/admin/users/pending`)).json()).users;
  const rejectedUser = pending.find((user) => user.email === "rejected@example.com");
  assert.ok(rejectedUser);
  const response = await fetch(`${baseUrl}/api/admin/users/${rejectedUser.id}/reject`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(adminRejectionResponseSchema.parse(await response.json()).user.approvalStatus, "rejected");
  const refreshed = pendingUsersResponseSchema.parse(await (await fetch(`${baseUrl}/api/admin/users/pending`)).json()).users;
  assert.equal(refreshed.some((user) => user.id === rejectedUser.id), false);

  await authRequest("/logout", "POST", {});
  await authRequest("/login", "POST", { email: "rejected@example.com", password: "password123" });
  assert.equal(authResponseSchema.parse(await (await authRequest("/me")).json()).user.approvalStatus, "rejected");
  assert.equal(await errorCode(await fetch(`${baseUrl}/api/exam/banks/default`)), "SIGNUP_REJECTED");
});

test("MSW login returns the same credential error for unknown email and wrong password", async () => {
  const success = await authRequest("/login", "POST", { email: "TEST@example.com", password: "password123" });
  assert.equal(success.status, 200);
  const user = authResponseSchema.parse(await success.json()).user;

  const me = await authRequest("/me");
  assert.deepEqual(authResponseSchema.parse(await me.json()).user, user);

  for (const credentials of [
    { email: "test@example.com", password: "incorrect123" },
    { email: "missing@example.com", password: "password123" },
  ]) {
    const failed = await authRequest("/login", "POST", credentials);
    assert.equal(failed.status, 401);
    assert.equal(await errorCode(failed), "INVALID_CREDENTIALS");
  }
});

test("MSW rejects stale approvals and blocks a rejected admin on all admin routes", async () => {
  const admin = { id: "00000000-0000-4000-8000-000000000002", email: "admin@example.com", approvalStatus: "pending", role: "admin" };
  const rejected = { id: "00000000-0000-4000-8000-000000000003", email: "rejected@example.com", approvalStatus: "rejected", role: "member" };
  resetAuthMock([{ user: admin, password: "password123" }, { user: rejected, password: "password123" }]);
  await authRequest("/login", "POST", { email: admin.email, password: "password123" });
  const approval = await fetch(`${baseUrl}/api/admin/users/${rejected.id}/approve`, { method: "POST" });
  assert.equal(approval.status, 409);
  assert.equal(await errorCode(approval), "BUSINESS_RULE_VIOLATION");
  await fetch(`${baseUrl}/api/admin/users/${admin.id}/reject`, { method: "POST" });
  for (const [path, method] of [["pending", "GET"], [`${rejected.id}/approve`, "POST"], [`${rejected.id}/reject`, "POST"]]) {
    const response = await fetch(`${baseUrl}/api/admin/users/${path}`, { method });
    assert.equal(response.status, 403);
    assert.equal(await errorCode(response), "SIGNUP_REJECTED");
  }
});

test("MSW logout is idempotent and clears the current mock user", async () => {
  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const logout = await authRequest("/logout", "POST", {});
  assert.equal(logout.status, 204);
  assert.equal(await authRequest("/me").then((response) => response.status), 401);
  assert.equal((await authRequest("/logout", "POST", {})).status, 204);
});

test("MSW exam bank requires a signed-in user", async () => {
  const bankUrl = `${baseUrl}/api/exam/banks/default`;
  const signedOut = await fetch(bankUrl);
  assert.equal(signedOut.status, 401);
  assert.equal(await errorCode(signedOut), "UNAUTHORIZED");

  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const signedIn = await fetch(bankUrl);
  assert.equal(signedIn.status, 200);
  const bank = await signedIn.json();
  assert.equal(bank.id, "aws-sap");

  await authRequest("/logout", "POST", {});
  const signedOutAgain = await fetch(bankUrl);
  assert.equal(signedOutAgain.status, 401);
});

test("MSW exam bank not-found and validation errors use the shared envelope", async () => {
  await authRequest("/login", "POST", { email: "test@example.com", password: "password123" });
  const missing = await fetch(`${baseUrl}/api/exam/banks/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(apiErrorResponseSchema.parse(await missing.json()).error, {
    code: "NOT_FOUND",
    message: "Exam bank not found",
  });

  const invalid = await fetch(`${baseUrl}/api/exam/banks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema: "unknown" }),
  });
  assert.equal(invalid.status, 400);
  const body = apiErrorResponseSchema.parse(await invalid.json());
  assert.equal(body.error.code, "INVALID_INPUT");
  assert.ok(body.error.details?.length);
  assert.equal("issues" in body, false);

  const unknownRoute = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(unknownRoute.status, 404);
  assert.equal(await errorCode(unknownRoute), "NOT_FOUND");
});
