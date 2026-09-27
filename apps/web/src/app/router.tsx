import { createBrowserRouter } from "react-router";
import type { QueryClient } from "@tanstack/react-query";
import RootLayout from "./root-layout";
import Home from "../pages/home";
import { createItemsAction } from "../features/items/action";
import { homeLoader } from "../pages/home/loader";

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter([
    {
      Component: RootLayout,
      children: [
        {
          index: true,
          Component: Home,
          loader: () => homeLoader(queryClient),
          action: createItemsAction(queryClient),
        },
      ],
    },
  ]);
