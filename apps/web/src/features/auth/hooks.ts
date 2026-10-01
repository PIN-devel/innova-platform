import { useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { currentUserQuery } from "@/entities/auth/queries";
import { getSessionVersion, isSessionTransitioning, subscribeSession } from "@/entities/auth/session-version";

export function useSessionScope() {
  const client = useQueryClient();
  const snapshot = useSyncExternalStore((listener) => subscribeSession(client, listener),
    () => `${getSessionVersion(client)}:${isSessionTransitioning(client)}`, () => `${getSessionVersion(client)}:false`);
  return { epoch: Number(snapshot.split(":")[0]), transitioning: snapshot.endsWith(":true") };
}
export function useCurrentUser() {
  // Router is the only initiator; all components observe this same cache.
  return useQuery({ ...currentUserQuery(), enabled: false });
}
