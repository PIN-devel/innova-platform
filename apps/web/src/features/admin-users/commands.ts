import type { QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@innova/contracts";
import { approveUser, rejectUser } from "@/entities/admin-users/api";
import { adminUserKeys } from "@/entities/admin-users/queries";
import { authKeys } from "@/entities/auth/queries";
import { assertSessionVersion, getSessionVersion } from "@/entities/auth/session-version";
import { cacheAuthenticatedUser, handleSessionApiError } from "@/features/auth/clear-protected-queries";

const pending = new WeakMap<QueryClient, Set<string>>();
export async function decideUser(client: QueryClient, intent: "approve" | "reject", id: string) {
  const epoch = getSessionVersion(client);
  const locks = pending.get(client) ?? new Set<string>(); pending.set(client, locks);
  const lock = `${epoch}:${id}`;
  if (locks.has(lock)) throw new Error("이미 처리 중인 사용자입니다.");
  locks.add(lock);
  try {
    const user = await (intent === "approve" ? approveUser : rejectUser)(id);
    assertSessionVersion(client, epoch);
    const key = adminUserKeys.pending(epoch);
    await client.cancelQueries({ queryKey: key, exact: true });
    assertSessionVersion(client, epoch);
    client.setQueryData<AuthUser[]>(key, (users) => users?.filter((entry) => entry.id !== user.id));
    if (client.getQueryData<AuthUser | null>(authKeys.me)?.id === user.id) cacheAuthenticatedUser(client, user);
    await client.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
    return user;
  } catch (error) {
    assertSessionVersion(client, epoch); handleSessionApiError(client, error); throw error;
  } finally { locks.delete(lock); }
}
