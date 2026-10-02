import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useRevalidator } from "react-router";

export async function refreshRoute(client: QueryClient, keys: readonly QueryKey[], revalidate: () => Promise<void>) {
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey, refetchType: "none" })));
  await revalidate();
}

// Routes/features choose their keys. No domain key is known by this helper.
export function useRouteRefresh(keys: readonly QueryKey[] = []) {
  const client = useQueryClient();
  const revalidator = useRevalidator();
  return () => refreshRoute(client, keys, () => revalidator.revalidate());
}
