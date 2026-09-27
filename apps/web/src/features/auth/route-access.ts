import type { AuthUser } from "@innova/contracts";

export function getPostAuthPath(user: AuthUser, requestedPath = "/exam") {
  if (user.approvalStatus === "pending" && !(user.role === "admin" && requestedPath.startsWith("/admin/"))) {
    return "/approval-pending";
  }
  return requestedPath;
}

export function getExamRedirect(user: AuthUser) {
  return user.approvalStatus === "pending" ? "/approval-pending" : null;
}

export function getApprovalPendingRedirect(user: AuthUser) {
  return user.approvalStatus === "approved" ? "/exam" : null;
}

export function getAdminRedirect(user: AuthUser) {
  if (user.role === "admin") return null;
  return user.approvalStatus === "pending" ? "/approval-pending" : "/exam";
}
