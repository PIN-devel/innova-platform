import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { pendingUsersQuery } from "@/entities/admin-users/queries";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { decideUser } from "@/features/admin-users/commands";
import { requireAccess } from "@/features/auth/route-session";
import { actionError, type ActionResult } from "@/shared/lib/router-query/action-result";
import { loadRouteQuery } from "@/shared/lib/router-query/route-query";

export const adminLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "admin");
  return loadRouteQuery(client, pendingUsersQuery(epoch), request, () => assertSessionVersion(client, epoch));
};

export const adminAction = (client: QueryClient) => async ({ request, context }: ActionFunctionArgs) => {
  requireAccess(context, client, request, "admin");
  const form = await request.formData(); const intent = form.get("intent"); const id = form.get("id");
  if ((intent !== "approve" && intent !== "reject") || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return data({ error: "처리할 사용자를 확인해 주세요." }, { status: 400 });
  try { await decideUser(client, intent, id); }
  catch (error) { if (isCancelledError(error)) throw error; return data(actionError(error), { status: 400 }); }
  request.signal.throwIfAborted(); return { ok: true } satisfies ActionResult;
};
