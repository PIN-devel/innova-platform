import { useQuery } from "@tanstack/react-query";
import { pendingUsersQuery } from "@/entities/admin-users/queries";
import { useSessionScope } from "@/features/auth/hooks";
export function usePendingUsers() {
  const { epoch } = useSessionScope();
  return useQuery({ ...pendingUsersQuery(epoch), enabled: false });
}
