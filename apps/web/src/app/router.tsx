import { createBrowserRouter, type RouteObject } from "react-router";
import type { QueryClient } from "@tanstack/react-query";
import RootLayout from "./root-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";
import Home from "../pages/home";
import { PublicOnly, RequireAdmin, RequireApprovalPending, RequireAuth, RequireSignupRejected } from "@/features/auth/auth-boundary";
import ApprovalPendingPage from "@/pages/approval-pending";
import SignupRejectedPage from "@/pages/signup-rejected";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import { ExamContentErrorBoundary, RootRouteErrorBoundary, StandardContentErrorBoundary } from "./route-error-boundary";
import { accessMiddleware, sessionMiddleware } from "@/features/auth/route-session";
import { adminAction, adminLoader, authAction, examAction, examLoader } from "./route-data";
import { InitialRouteLoading } from "./route-loading";

export const createAppRoutes = (client: QueryClient): RouteObject[] => ([
  { id: "root", Component: RootLayout, ErrorBoundary: RootRouteErrorBoundary, HydrateFallback: InitialRouteLoading,
    middleware: [sessionMiddleware(client)], loader: () => null,
    children: [
      { id: "standard", Component: StandardContentLayout, ErrorBoundary: StandardContentErrorBoundary, children: [
        { index: true, Component: Home },
        { Component: PublicOnly, middleware: [accessMiddleware(client, "public")], children: [
          { path: "login", action: authAction(client, "login"), lazy: async () => ({ Component: (await import("@/pages/auth/auth-pages")).LoginPage }) },
          { path: "signup", action: authAction(client, "signup"), lazy: async () => ({ Component: (await import("@/pages/auth/auth-pages")).SignupPage }) },
        ] },
        { Component: RequireApprovalPending, middleware: [accessMiddleware(client, "pending")], children: [{ path: "approval-pending", loader: () => null, Component: ApprovalPendingPage }] },
        { Component: RequireSignupRejected, middleware: [accessMiddleware(client, "rejected")], children: [{ path: "signup-rejected", loader: () => null, Component: SignupRejectedPage }] },
        { Component: RequireAdmin, middleware: [accessMiddleware(client, "admin")], children: [{ id: "admin", path: "admin/users", loader: adminLoader(client), action: adminAction(client), lazy: async () => ({ Component: (await import("@/pages/admin-users")).default }) }] },
        { path: "logout", action: authAction(client, "logout"), Component: Home },
        { path: "*", Component: NotFoundPage },
      ] },
      { id: "exam-layout", Component: ExamContentLayout, ErrorBoundary: ExamContentErrorBoundary, children: [
        { Component: RequireAuth, middleware: [accessMiddleware(client, "exam")], children: [{ id: "exam", path: "exam", loader: examLoader(client), action: examAction(client),

          lazy: async () => ({ Component: (await import("@/pages/exam/exam-page")).default }),
        }] },
      ] },
    ],
  },
]);
export const createAppRouter = (client: QueryClient) => createBrowserRouter(createAppRoutes(client));
