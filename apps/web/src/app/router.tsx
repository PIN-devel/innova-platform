import { createBrowserRouter } from "react-router";
import RootLayout from "./root-layout";
import Home from "../pages/home";
import ExamPage from "../pages/exam/ExamPage";
import { PublicOnly, RequireAuth } from "@/features/auth/AuthBoundary";
import { LoginPage, SignupPage } from "@/pages/auth/AuthPages";
import { NotFoundPage } from "@/pages/not-found/NotFoundPage";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

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
        { path: "*", Component: NotFoundPage },
      ],
    },
  ]);
