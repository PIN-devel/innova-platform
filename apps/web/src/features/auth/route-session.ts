import { routeQuery } from "@/shared/api/route-query";
import { createContext, replace, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@innova/contracts";
import { currentUserQuery } from "@/entities/auth/queries";
import { assertSessionVersion, getSessionVersion, isSessionTransitioning } from "@/entities/auth/session-version";
import { getAdminRedirect, getApprovalPendingRedirect, getExamRedirect, getPostAuthPath, getSignupRejectedRedirect } from "./route-access";

export type Access = "public" | "exam" | "admin" | "pending" | "rejected";
type Scope = { user: AuthUser | null; epoch: number; error?: unknown };
export const sessionContext = createContext<Scope>();
export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/exam";
  const url = new URL(value, "https://innova.invalid");
  return url.origin === "https://innova.invalid" && ["/exam", "/admin/users", "/"].includes(url.pathname)
    ? `${url.pathname}${url.search}` : "/exam";
}
export const sessionMiddleware = (client: QueryClient): MiddlewareFunction => async ({ request, context }, next) => {
  if (request.method !== "GET" && ["/login", "/signup", "/logout"].includes(new URL(request.url).pathname)) return next();
  if (isSessionTransitioning(client)) throw new Error("계정 변경 중입니다. 잠시 후 다시 시도해 주세요.");
  let user: AuthUser | null = null; let error: unknown;
  try { user = await routeQuery(client, currentUserQuery(client)); } catch (cause) { if (isCancelledError(cause)) throw cause; error = cause; }
  request.signal.throwIfAborted();
  context.set(sessionContext, { user, epoch: getSessionVersion(client), error });
  return next();
};
export function requireAccess(context: Readonly<RouterContextProvider>, client: QueryClient, request: Request, access: Access) {
  const scope = context.get(sessionContext);
  request.signal.throwIfAborted(); assertSessionVersion(client, scope.epoch);
  if (scope.error) { if (access === "public") return scope; throw scope.error; }
  if (access === "public") {
    if (scope.user) throw replace(getPostAuthPath(scope.user, safeReturnTo(new URL(request.url).searchParams.get("returnTo"))));
    return scope;
  }
  if (!scope.user) throw replace(`/login?returnTo=${encodeURIComponent(new URL(request.url).pathname + new URL(request.url).search)}`);
  const path = { exam: getExamRedirect, admin: getAdminRedirect, pending: getApprovalPendingRedirect, rejected: getSignupRejectedRedirect }[access](scope.user);
  if (path) throw replace(path);
  return scope;
}
export const accessMiddleware = (client: QueryClient, access: Access): MiddlewareFunction => async ({ context, request }, next) => {
  if (!(access === "public" && request.method !== "GET")) requireAccess(context, client, request, access);
  return next();
};
