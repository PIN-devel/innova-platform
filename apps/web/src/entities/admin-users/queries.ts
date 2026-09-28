import { queryOptions } from "@tanstack/react-query";
import { approveUser, getPendingUsers, rejectUser } from "./api";

export const adminUserKeys = {
  pending: ["admin", "users", "pending"] as const,
};

export const pendingUsersQuery = () => queryOptions({
  queryKey: adminUserKeys.pending,
  queryFn: getPendingUsers,
  staleTime: 0,
  retry: false,
});

export { approveUser };
export { rejectUser };
