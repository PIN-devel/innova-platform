import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUserKeys, approveUser, pendingUsersQuery, rejectUser } from "@/entities/admin-users/queries";

export function usePendingUsers() {
  return useQuery(pendingUsersQuery());
}

export function useRejectUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.pending }),
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.pending }),
  });
}
