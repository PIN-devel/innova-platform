import { createBrowserRouter } from "react-router";
import RootLayout from "./root-layout";
import Home from "../pages/home";
import ExamPage from "../pages/exam/exam-page";
import { PublicOnly, RequireAdmin, RequireApprovalPending, RequireAuth } from "@/features/auth/auth-boundary";
import { LoginPage, SignupPage } from "@/pages/auth/auth-pages";
import ApprovalPendingPage from "@/pages/approval-pending";
import AdminUsersPage from "@/pages/admin-users";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import { RouteErrorBoundary } from "./route-error-boundary";

export const createAppRouter = () =>
  createBrowserRouter([
    {
      Component: RootLayout,
      ErrorBoundary: RouteErrorBoundary,
      children: [
        {
          index: true,
          Component: Home,
        },
        {
          Component: PublicOnly,
          children: [
            { path: "login", Component: LoginPage },
            { path: "signup", Component: SignupPage },
          ],
        },
        {
          Component: RequireAuth,
          children: [{ path: "exam", Component: ExamPage }],
        },
        {
          Component: RequireApprovalPending,
          children: [{ path: "approval-pending", Component: ApprovalPendingPage }],
        },
        {
          Component: RequireAdmin,
          children: [{ path: "admin/users", Component: AdminUsersPage }],
        },
        { path: "*", Component: NotFoundPage },
      ],
    },
  ]);
