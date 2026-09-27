import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { RouterProvider } from "react-router/dom";
import { queryClient } from "./app/query-client.ts";
import { createAppRouter } from "./app/router.tsx";
import { Toaster } from "@/shared/ui/sonner";
import "./styles.css";

async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.MODE === "api") return;
  const { worker } = await import("./mocks/browser");
  await worker.start();
}

enableMocking().then(() => {
  const router = createAppRouter();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
