import { queryOptions } from "@tanstack/react-query";
import { getCurrentUser } from "./api";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export const currentUserQuery = () => queryOptions({
  queryKey: authKeys.me,
  queryFn: getCurrentUser,
  staleTime: 0,
  retry: false,
});
