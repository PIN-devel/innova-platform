import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUserKeys, approveUser, pendingUsersQuery } from "@/entities/admin-users/queries";

export function usePendingUsers() {
  return useQuery(pendingUsersQuery());
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.pending }),
  });
}
