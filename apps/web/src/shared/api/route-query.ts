import { QueryObserver, type QueryClient, type FetchQueryOptions, type QueryKey } from "@tanstack/react-query";

// Keep an observer while the Router owns a read. A temporary UI observer's
// StrictMode cleanup must not cancel a request still awaited by a loader.
export async function routeQuery<T, K extends QueryKey>(client: QueryClient, options: FetchQueryOptions<T, Error, T, K>) {
  const observer = new QueryObserver(client, { ...options, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  try { return await client.query(options); }
  finally {
    const query = observer.getCurrentQuery();
    unsubscribe();
    // Session removal can detach the query before its last observer is released.
    // Do not leave a GC timer on that removed query.
    if (client.getQueryCache().get<T, Error, T, K>(query.queryHash) !== query) query.destroy();
  }
}
