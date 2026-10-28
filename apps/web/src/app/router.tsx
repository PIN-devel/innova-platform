import { createBrowserRouter, type RouteObject } from "react-router";
import type { QueryClient } from "@tanstack/react-query";
import RootLayout from "./root-layout";
import { MotifinContentLayout } from "./motifin-content-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";
import Home from "../pages/home";
import { PublicOnly, RequireAdmin, RequireApprovalPending, RequireAuth, RequireSignupRejected } from "@/features/auth/auth-boundary";
import ApprovalPendingPage from "@/pages/approval-pending";
import SignupRejectedPage from "@/pages/signup-rejected";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import { MotifinContentErrorBoundary, ExamContentErrorBoundary, RootRouteErrorBoundary, StandardContentErrorBoundary } from "./route-error-boundary";
import { accessMiddleware, sessionMiddleware } from "@/features/auth/route-session";
import { adminAction, adminLoader } from "@/pages/admin-users/route";
import { authAction } from "@/pages/auth/route";
import { examAction, examLoader } from "@/pages/exam/route";
import { InitialRouteLoading } from "./route-loading";
import { rawLoader, rawAction } from "@/pages/finance-raw/route";

import {spendingLoader,spendingAction} from '@/pages/finance-spending/route';

import {reviewLoader} from '@/pages/finance-review/route';

import {analysisLoader} from '@/pages/finance-analysis/route';

import {scheduleLoader,scheduleAction} from '@/pages/finance-schedule/route';

import {securityLoader,securityAction} from '@/pages/finance-security/route';

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
      { id: "motifin-layout", Component: MotifinContentLayout, ErrorBoundary: MotifinContentErrorBoundary, children: [
        { Component: RequireAuth, middleware: [accessMiddleware(client, "exam")], children: [{id:"finance-security",path:"motifin/security",loader:securityLoader(client),action:securityAction(client),lazy:async()=>({Component:(await import("@/pages/finance-security/finance-security-page")).default})},{id:"finance-schedule",path:"motifin/schedule",loader:scheduleLoader(client),action:scheduleAction(client),lazy:async()=>({Component:(await import("@/pages/finance-schedule/finance-schedule-page")).default})},{id:"finance-analysis",path:"motifin/analysis",loader:analysisLoader(client),lazy:async()=>({Component:(await import("@/pages/finance-analysis/finance-analysis-page")).default})},{id:"finance-review",path:"motifin/review",loader:reviewLoader(client),lazy:async()=>({Component:(await import("@/pages/finance-review/finance-review-page")).default})},{id:"finance-spending",path:"motifin/spending",loader:spendingLoader(client),action:spendingAction(client),lazy:async()=>({Component:(await import("@/pages/finance-spending/finance-spending-page")).default})}, { id: "finance-raw", path: "motifin/import", loader: rawLoader(client), action: rawAction(client), lazy: async () => ({ Component: (await import("@/pages/finance-raw/finance-raw-page")).default }) }] },
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
