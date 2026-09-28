import { CancelledError, type QueryClient } from "@tanstack/react-query";

// Fence imperative async work that QueryClient cannot cancel (for example a POST).
const versions = new WeakMap<QueryClient, number>();

export const getSessionVersion = (client: QueryClient) => versions.get(client) ?? 0;

export function advanceSessionVersion(client: QueryClient) {
  versions.set(client, getSessionVersion(client) + 1);
}

export function assertSessionVersion(client: QueryClient, version: number) {
  if (getSessionVersion(client) !== version) throw new CancelledError({ silent: true });
}
