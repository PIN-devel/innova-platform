import type { QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@innova/contracts";
import { adminUserKeys } from "@/entities/admin-users/queries";
import { authKeys } from "@/entities/auth/queries";
import { examBankKeys } from "@/entities/exam-bank/queries";

export function clearProtectedQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: adminUserKeys.pending });
  queryClient.removeQueries({ queryKey: examBankKeys.all });
}

export function cacheAuthenticatedUser(queryClient: QueryClient, user: AuthUser) {
  clearProtectedQueries(queryClient);
  queryClient.setQueryData(authKeys.me, user);
}

export function clearSessionCache(queryClient: QueryClient) {
  queryClient.clear();
  queryClient.setQueryData(authKeys.me, null);
}
