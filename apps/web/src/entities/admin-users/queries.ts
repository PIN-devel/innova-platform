import { queryOptions } from "@tanstack/react-query";
import { getPendingUsers } from "./api";

export const adminUserKeys = {
  all: ["admin", "users", "pending"] as const,
  pending: (epoch = 0) => ["admin", "users", "pending", epoch] as const,
};

export const pendingUsersQuery = (epoch = 0) => queryOptions({
  queryKey: adminUserKeys.pending(epoch),
  meta: { sessionVersion: epoch },
  queryFn: ({ signal }) => getPendingUsers(signal),
  staleTime: 0,
  retry: false,
});
