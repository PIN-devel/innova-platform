import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveUser, invalidatePendingUsers, pendingUsersQuery, rejectUser } from "@/entities/admin-users/queries";

export function usePendingUsers() {
  return useQuery(pendingUsersQuery());
}

export function useRejectUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectUser,
    onSuccess: () => invalidatePendingUsers(queryClient),
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveUser,
    onSuccess: () => invalidatePendingUsers(queryClient),
  });
}
