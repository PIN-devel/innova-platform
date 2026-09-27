import { createBrowserRouter } from "react-router";
import RootLayout from "./root-layout";
import Home from "../pages/home";
import ExamPage from "../pages/exam/exam-page";
import { PublicOnly, RequireAuth } from "@/features/auth/auth-boundary";
import { LoginPage, SignupPage } from "@/pages/auth/auth-pages";
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
        { path: "*", Component: NotFoundPage },
      ],
    },
  ]);
