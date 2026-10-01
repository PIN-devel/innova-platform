// The client is a per-router coordinator, never part of the HTTP resource identity.
/* eslint-disable @tanstack/query/exhaustive-deps */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { assertSessionVersion, getSessionVersion } from "./session-version";
import { getCurrentUser } from "./api";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export const currentUserQuery = (client?: QueryClient) => queryOptions({
  queryKey: authKeys.me,
  queryFn: async ({ signal }) => {
    const epoch = client ? getSessionVersion(client) : 0;
    try {
      const user = await getCurrentUser(signal);
      if (client) assertSessionVersion(client, epoch);
      return user;
    } catch (error) { if (client) assertSessionVersion(client, epoch); throw error; }
  },
  staleTime: 0,
  retry: false,
});
