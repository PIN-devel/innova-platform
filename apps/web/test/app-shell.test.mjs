import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createServer } from "vite";

let vite;
let createAppRoutes;
let currentUserQuery;
let examBankQuery;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ createAppRoutes } = await vite.ssrLoadModule("/src/app/router.tsx"));
  ({ currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ examBankQuery } = await vite.ssrLoadModule("/src/entities/exam-bank/queries.ts"));
  globalThis.localStorage = { getItem: () => null };
});
after(async () => { delete globalThis.localStorage; await vite?.close(); });

function renderRoute(path, user, bank, customizeRoutes) {
  const queryClient = new QueryClient();
  if (user !== undefined) queryClient.setQueryData(currentUserQuery().queryKey, user);
  if (bank) queryClient.setQueryData(examBankQuery("aws-sap").queryKey, { bank });
  const routes = createAppRoutes();
  const hydrationData = customizeRoutes?.(routes);
  const router = createMemoryRouter(routes, { initialEntries: [path], ...(hydrationData ? { hydrationData } : {}) });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router })));
  void router.dispose();
  queryClient.clear();
  return html;
}

test("platform shell persists across standard routes and exam loading, with a single main landmark", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  for (const path of ["/", "/login", "/admin/users", "/missing", "/exam"]) {
    const html = renderRoute(path, user);
    assert.match(html, /Innova Platform/);
    assert.match(html, /aria-label="주요 탐색"/);
    assert.match(html, /href="\/exam"/);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, path);
  }
});

test("exam learning header and tabs stay inside the common shell without duplicate account actions", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const html = renderRoute("/exam", user, { subject: "AWS SAP", concepts: [], scenarios: [] });
  assert.match(html, /aria-label="Exam Drill 메뉴"/);
  assert.match(html, /AWS SAP · 0개 개념/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/로그아웃/g) ?? []).length, 1);
  assert.equal((html.match(/사용자 승인/g) ?? []).length, 1);
});

test("auth check and nested route errors render within the common shell", () => {
  const checking = renderRoute("/exam");
  assert.match(checking, /계정 정보를 확인하고 있습니다/);
  assert.equal((checking.match(/<main\b/g) ?? []).length, 1);

  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const failed = renderRoute("/admin/users", user, undefined, (routes) => {
    routes[0].children[0].id = "standard-layout";
    return { loaderData: {}, errors: { "standard-layout": new Error("render failed") } };
  });
  assert.match(failed, /페이지를 표시하지 못했습니다/);
  assert.match(failed, /Innova Platform/);
  assert.equal((failed.match(/<main\b/g) ?? []).length, 1);

  const examFailed = renderRoute("/exam", user, undefined, (routes) => {
    routes[0].children[1].id = "exam-layout";
    return { loaderData: {}, errors: { "exam-layout": new Error("exam failed") } };
  });
  assert.match(examFailed, /페이지를 표시하지 못했습니다/);
  assert.match(examFailed, /aria-label="주요 탐색"/);
  assert.equal((examFailed.match(/<main\b/g) ?? []).length, 1);

  const rootFailed = renderRoute("/", user, undefined, (routes) => {
    routes[0].id = "root-layout";
    return { loaderData: {}, errors: { "root-layout": new Error("root failed") } };
  });
  assert.match(rootFailed, /페이지를 표시하지 못했습니다/);
  assert.match(rootFailed, /aria-label="주요 탐색"/);
  assert.equal((rootFailed.match(/<main\b/g) ?? []).length, 1);
});
