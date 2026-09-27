import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAdminRedirect,
  getApprovalPendingRedirect,
  getExamRedirect,
  getPostAuthPath,
} from "../src/features/auth/route-access.ts";

const memberPending = { id: "1", email: "pending@example.com", approvalStatus: "pending", role: "member" };
const memberApproved = { ...memberPending, approvalStatus: "approved" };
const adminPending = { ...memberPending, role: "admin" };

test("post-auth navigation and protected route decisions distinguish approval from role", () => {
  assert.equal(getPostAuthPath(memberPending), "/approval-pending");
  assert.equal(getPostAuthPath(memberPending, "/admin/users"), "/approval-pending");
  assert.equal(getPostAuthPath(adminPending, "/admin/users"), "/admin/users");
  assert.equal(getPostAuthPath(adminPending), "/approval-pending");
  assert.equal(getPostAuthPath(memberApproved), "/exam");
  assert.equal(getPostAuthPath(memberApproved, "/exam?tab=review"), "/exam?tab=review");

  assert.equal(getExamRedirect(memberPending), "/approval-pending");
  assert.equal(getExamRedirect(memberApproved), null);
  assert.equal(getApprovalPendingRedirect(memberPending), null);
  assert.equal(getApprovalPendingRedirect(memberApproved), "/exam");

  assert.equal(getAdminRedirect(memberPending), "/approval-pending");
  assert.equal(getAdminRedirect(memberApproved), "/exam");
  assert.equal(getAdminRedirect(adminPending), null);
});
