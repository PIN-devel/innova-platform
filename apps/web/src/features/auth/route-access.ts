import type { AuthUser } from "@innova/contracts";

export function getPostAuthPath(user: AuthUser, requestedPath = "/exam") {
  if (user.approvalStatus === "rejected") return "/signup-rejected";
  if (user.approvalStatus === "pending" && !(user.role === "admin" && requestedPath.startsWith("/admin/"))) {
    return "/approval-pending";
  }
  return requestedPath;
}

export function getExamRedirect(user: AuthUser) {
  if (user.approvalStatus === "rejected") return "/signup-rejected";
  return user.approvalStatus === "pending" ? "/approval-pending" : null;
}

export function getApprovalPendingRedirect(user: AuthUser) {
  if (user.approvalStatus === "rejected") return "/signup-rejected";
  return user.approvalStatus === "approved" ? "/exam" : null;
}

export function getAdminRedirect(user: AuthUser) {
  if (user.approvalStatus === "rejected") return "/signup-rejected";
  if (user.role === "admin") return null;
  return user.approvalStatus === "pending" ? "/approval-pending" : "/exam";
}

export function getSignupRejectedRedirect(user: AuthUser) {
  if (user.approvalStatus === "rejected") return null;
  return user.approvalStatus === "pending" ? "/approval-pending" : "/exam";
}
