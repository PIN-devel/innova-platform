import { mutationOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { adminUserKeys, approveUser, invalidatePendingUsers, pendingUsersQuery, rejectUser } from "@/entities/admin-users/queries";
import type { AuthUser, PendingUsersResponse } from "@innova/contracts";
import { authKeys } from "@/entities/auth/queries";
import { getSessionVersion } from "@/entities/auth/session-version";
import { cacheAuthenticatedUser, handleSessionApiError } from "@/features/auth/clear-protected-queries";

export function usePendingUsers() {
  return useQuery(pendingUsersQuery());
}

export function userDecisionMutation(queryClient: QueryClient, mutationFn: (id: string) => Promise<AuthUser>) {
  return mutationOptions({
    mutationFn,
    onMutate: () => getSessionVersion(queryClient),
    onSuccess: (user, _id, version) => {
      if (version !== getSessionVersion(queryClient)) return;
      // A committed decision must not reappear as pending if the refresh fails.
      queryClient.setQueryData<PendingUsersResponse["users"]>(adminUserKeys.pending, (users) => users?.filter((pending) => pending.id !== user.id));
      if (queryClient.getQueryData<AuthUser | null>(authKeys.me)?.id === user.id) {
        cacheAuthenticatedUser(queryClient, user);
      }
      return invalidatePendingUsers(queryClient);
    },
    onError: (error, _id, version) => {
      if (version === getSessionVersion(queryClient)) handleSessionApiError(queryClient, error);
    },
  });
}

export const useRejectUser = () => useMutation(userDecisionMutation(useQueryClient(), rejectUser));
export const useApproveUser = () => useMutation(userDecisionMutation(useQueryClient(), approveUser));
