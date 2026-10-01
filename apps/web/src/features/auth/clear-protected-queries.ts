import type { QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@innova/contracts";
import { adminUserKeys } from "@/entities/admin-users/queries";
import { authKeys } from "@/entities/auth/queries";
import { examBankKeys } from "@/entities/exam-bank/queries";
import { advanceSessionVersion, isSessionTransitioning, setSessionTransitioning } from "@/entities/auth/session-version";
import { ApiError } from "@/shared/api/client";

export function isProtectedQueryKey(key: readonly unknown[]) {
  return [adminUserKeys.all, examBankKeys.all].some((prefix) => prefix.every((part, index) => key[index] === part));
}

export function clearProtectedQueries(queryClient: QueryClient) {
  advanceSessionVersion(queryClient);
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({ queryKey: adminUserKeys.all });
  queryClient.removeQueries({ queryKey: examBankKeys.all });
}

export function cacheAuthenticatedUser(queryClient: QueryClient, user: AuthUser) {
  void queryClient.cancelQueries({ queryKey: authKeys.me });
  const transitioning = isSessionTransitioning(queryClient);
  setSessionTransitioning(queryClient, true);
  clearProtectedQueries(queryClient);
  queryClient.setQueryData(authKeys.me, user);
  setSessionTransitioning(queryClient, transitioning);
}

export function clearSessionCache(queryClient: QueryClient) {
  void queryClient.cancelQueries({ queryKey: authKeys.me });
  const transitioning = isSessionTransitioning(queryClient);
  setSessionTransitioning(queryClient, true);
  clearProtectedQueries(queryClient);
  queryClient.setQueryData(authKeys.me, null);
  setSessionTransitioning(queryClient, transitioning);
}

export function handleSessionApiError(queryClient: QueryClient, error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.code === "UNAUTHORIZED") {
    clearSessionCache(queryClient);
    return true;
  }
  if (error.code === "APPROVAL_PENDING" || error.code === "SIGNUP_REJECTED" || error.code === "FORBIDDEN") {
    void queryClient.cancelQueries({ queryKey: authKeys.me });
    clearProtectedQueries(queryClient);
    if (error.code !== "FORBIDDEN") {
      const approvalStatus = error.code === "SIGNUP_REJECTED" ? "rejected" : "pending";
      queryClient.setQueryData<AuthUser | null>(authKeys.me, (user) => user ? { ...user, approvalStatus } : user);
    }
    void queryClient.invalidateQueries({ queryKey: authKeys.me, refetchType: "none" });
    return true;
  }
  return false;
}
