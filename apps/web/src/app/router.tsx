import { createBrowserRouter, type RouteObject } from "react-router";
import RootLayout from "./root-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";
import Home from "../pages/home";
import ExamPage from "../pages/exam/exam-page";
import { PublicOnly, RequireAdmin, RequireApprovalPending, RequireAuth, RequireSignupRejected } from "@/features/auth/auth-boundary";
import { LoginPage, SignupPage } from "@/pages/auth/auth-pages";
import ApprovalPendingPage from "@/pages/approval-pending";
import AdminUsersPage from "@/pages/admin-users";
import SignupRejectedPage from "@/pages/signup-rejected";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import { ExamContentErrorBoundary, RootRouteErrorBoundary, StandardContentErrorBoundary } from "./route-error-boundary";

export const createAppRoutes = (): RouteObject[] =>
  ([
    {
      Component: RootLayout,
      ErrorBoundary: RootRouteErrorBoundary,
      children: [
        {
          Component: StandardContentLayout,
          ErrorBoundary: StandardContentErrorBoundary,
          children: [
            { index: true, Component: Home },
            {
              Component: PublicOnly,
              children: [
                { path: "login", Component: LoginPage },
                { path: "signup", Component: SignupPage },
              ],
            },
            {
              Component: RequireApprovalPending,
              children: [{ path: "approval-pending", Component: ApprovalPendingPage }],
            },
            {
              Component: RequireSignupRejected,
              children: [{ path: "signup-rejected", Component: SignupRejectedPage }],
            },
            {
              Component: RequireAdmin,
              children: [{ path: "admin/users", Component: AdminUsersPage }],
            },
            { path: "*", Component: NotFoundPage },
          ],
        },
        {
          Component: ExamContentLayout,
          ErrorBoundary: ExamContentErrorBoundary,
          children: [
            {
              Component: RequireAuth,
              children: [{ path: "exam", Component: ExamPage }],
            },
          ],
        },
      ],
    },
  ]);

export const createAppRouter = () => createBrowserRouter(createAppRoutes());
