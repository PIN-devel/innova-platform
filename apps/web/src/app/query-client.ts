import { QueryCache, QueryClient } from "@tanstack/react-query";
import { getSessionVersion, isSessionTransitioning } from "@/entities/auth/session-version";
import type { AuthUser } from "@innova/contracts";
import { authKeys } from "@/entities/auth/queries";
import { clearProtectedQueries, handleSessionApiError, isProtectedQueryKey } from "@/features/auth/clear-protected-queries";

export function createQueryClient() {
  const cache = new QueryCache({
    onError: (error, query) => {
      if (isProtectedQueryKey(query.queryKey) && (query.meta?.sessionVersion ?? 0) === getSessionVersion(client)) handleSessionApiError(client, error);
    },
  });
  const client = new QueryClient({
    queryCache: cache,
    defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
  });
  let previousUser: AuthUser | null | undefined;
  cache.subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success"
      || !authKeys.me.every((part, index) => event.query.queryKey[index] === part)) return;
    const user = event.query.state.data as AuthUser | null;
    const changed = user?.id !== previousUser?.id || user?.role !== previousUser?.role
      || user?.approvalStatus !== previousUser?.approvalStatus;
    previousUser = user;
    // Includes /auth/me revalidation and explicit login/logout updates, before React renders.
    if (changed && !isSessionTransitioning(client)) clearProtectedQueries(client);
  });
  return client;
}

export const queryClient = createQueryClient();
