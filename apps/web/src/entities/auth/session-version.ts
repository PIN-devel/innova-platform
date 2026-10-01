import { CancelledError, type QueryClient } from "@tanstack/react-query";

const versions = new WeakMap<QueryClient, number>();
const transitions = new WeakSet<QueryClient>();
const listeners = new WeakMap<QueryClient, Set<() => void>>();
export const getSessionVersion = (client: QueryClient) => versions.get(client) ?? 0;
export const isSessionTransitioning = (client: QueryClient) => transitions.has(client);
export function subscribeSession(client: QueryClient, listener: () => void) {
  const set = listeners.get(client) ?? new Set();
  listeners.set(client, set); set.add(listener);
  return () => { set.delete(listener); };
}
function notify(client: QueryClient) { listeners.get(client)?.forEach((listener) => listener()); }
export function advanceSessionVersion(client: QueryClient) {
  versions.set(client, getSessionVersion(client) + 1); notify(client);
}
export function setSessionTransitioning(client: QueryClient, value: boolean) {
  if (value) transitions.add(client); else transitions.delete(client);
  notify(client);
}
export function assertSessionVersion(client: QueryClient, version: number) {
  if (getSessionVersion(client) !== version) throw new CancelledError({ silent: true });
}
