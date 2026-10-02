import { isCancelledError, QueryObserver, type QueryClient, type FetchQueryOptions, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";

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

// The caller owns its lifecycle fence (for example, the current session epoch).
export async function loadRouteQuery<T, K extends QueryKey>(
  client: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
  request: Request,
  assertCurrent: () => void,
) {
  try {
    await routeQuery(client, options);
  } catch (error) {
    assertCurrent();
    request.signal.throwIfAborted();
    const recoverable = !(error instanceof ApiError) || error.status >= 500;
    if (isCancelledError(error) || !recoverable || (error instanceof Error && error.name === "ZodError")
      || client.getQueryData(options.queryKey) === undefined) throw error;
  }
  assertCurrent();
  request.signal.throwIfAborted();
  return null;
}
