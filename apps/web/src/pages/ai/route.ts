import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { requireAccess } from "@/features/auth/route-session";

export const aiLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  requireAccess(context, client, request, "ai");
  return null;
};
