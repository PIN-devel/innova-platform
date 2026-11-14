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
let safeReturnTo;
let getPostAuthPath;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  ({ createAppRoutes } = await vite.ssrLoadModule("/src/app/router.tsx"));
  ({ currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ safeReturnTo } = await vite.ssrLoadModule("/src/features/auth/route-session.ts"));
  ({ getPostAuthPath } = await vite.ssrLoadModule("/src/features/auth/route-access.ts"));
});

after(async () => {
  await vite?.close();
});

async function renderRoute(path, user) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false } },
  });
  if (user !== undefined) {
    queryClient.setQueryData(currentUserQuery().queryKey, user);
  }
  const routes = createAppRoutes(queryClient);

  async function loadLazy(routeList) {
    for (const route of routeList) {
      if (route.lazy) {
        Object.assign(route, await route.lazy());
        delete route.lazy;
      }
      delete route.loader;
      delete route.middleware;
      if (route.children) await loadLazy(route.children);
    }
  }
  await loadLazy(routes);

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RouterProvider, { router }),
    ),
  );
  void router.dispose();
  queryClient.clear();
  return html;
}

test("safeReturnTo allows /ai and post-auth path preserves /ai for admin", () => {
  assert.equal(safeReturnTo("/ai"), "/ai");

  const admin = {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    approvalStatus: "approved",
  };
  const member = {
    id: "member-1",
    email: "member@example.com",
    role: "member",
    approvalStatus: "approved",
  };

  assert.equal(getPostAuthPath(admin, "/ai"), "/ai");
  assert.equal(getPostAuthPath(member, "/ai"), "/ai");
});

test("admin user sees AI Lab in primary nav and can view /ai page", async () => {
  const admin = {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    approvalStatus: "approved",
  };

  const homeHtml = await renderRoute("/", admin);
  assert.match(homeHtml, /href="\/ai"/);
  assert.match(homeHtml, /AI Lab/);
  assert.match(homeHtml, /AI Lab \(PoC\) →/);

  const aiHtml = await renderRoute("/ai", admin);
  assert.match(aiHtml, /K-EXAONE 2\.5 실시간 스트리밍 채팅 PoC/);
  assert.match(aiHtml, /k-exaone_v2\.5/);
  assert.match(aiHtml, /추론 강도:/);
  assert.match(aiHtml, /<option[^>]*value="low"[^>]*selected|<option[^>]*selected[^>]*value="low"/);
  assert.match(aiHtml, /대화 초기화/);
  assert.match(aiHtml, /메시지를 입력하세요/);
  assert.doesNotMatch(aiHtml, /403 Forbidden/);
});

test("non-admin (member) user does not see AI Lab nav and gets 403 Forbidden screen on /ai", async () => {
  const member = {
    id: "member-1",
    email: "member@example.com",
    role: "member",
    approvalStatus: "approved",
  };

  const homeHtml = await renderRoute("/", member);
  assert.doesNotMatch(homeHtml, /href="\/ai"/);
  assert.doesNotMatch(homeHtml, /AI Lab \(PoC\) →/);

  const aiHtml = await renderRoute("/ai", member);
  assert.match(aiHtml, /접근 권한이 없습니다 \(403 Forbidden\)/);
  assert.match(aiHtml, /AI Lab \(K-EXAONE 2\.5 PoC\)은 관리자 전용 서비스입니다\./);
  assert.match(aiHtml, /홈으로 이동/);
  assert.match(aiHtml, /Exam Drill 열기/);
  assert.doesNotMatch(aiHtml, /k-exaone_v2\.5/);
});
