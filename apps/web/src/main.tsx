import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { RouterProvider } from "react-router/dom";
import { queryClient } from "./app/query-client.ts";
import { createAppRouter } from "./app/router.tsx";
import "./styles.css";

async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.MODE === "api") return;

  const { worker } = await import("./mocks/browser");
  return worker.start();
}

enableMocking().then(() => {
  const router = createAppRouter(queryClient);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
