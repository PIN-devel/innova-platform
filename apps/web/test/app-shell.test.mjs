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
let pendingUsersQuery;
let ApiError;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ createAppRoutes } = await vite.ssrLoadModule("/src/app/router.tsx"));
  ({ currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ examBankQuery } = await vite.ssrLoadModule("/src/entities/exam-bank/queries.ts"));
  ({ pendingUsersQuery } = await vite.ssrLoadModule("/src/entities/admin-users/queries.ts"));
  ({ ApiError } = await vite.ssrLoadModule("/src/shared/api/client.ts"));
  globalThis.localStorage = { getItem: () => null };
});
after(async () => { delete globalThis.localStorage; await vite?.close(); });

function renderRoute(path, user, bank, customizeRoutes, configureQuery) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  if (user !== undefined) queryClient.setQueryData(currentUserQuery().queryKey, user);
  if (bank) queryClient.setQueryData(examBankQuery("aws-sap").queryKey, { bank });
  configureQuery?.(queryClient);
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

test("exam and admin first queries show page-shaped skeletons without empty or interactive content", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const exam = renderRoute("/exam", user);
  assert.match(exam, /문항 은행을 불러오는 중입니다/);
  assert.match(exam, /data-slot="skeleton"/);
  assert.doesNotMatch(exam, /aria-label="Exam Drill 메뉴"|레슨 시작|0개 개념/);

  const admin = renderRoute("/admin/users", user);
  assert.match(admin, /승인 대기 사용자를 불러오는 중입니다/);
  assert.match(admin, /data-slot="skeleton"/);
  assert.doesNotMatch(admin, /현재 승인 대기 중인 사용자가 없습니다|>승인<\/button>/);
});

test("existing exam and admin data remain visible during fetch and after recoverable fetch errors", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const bank = { subject: "AWS SAP", concepts: [{ id: "note-1" }], scenarios: [] };
  const users = [{ id: "2", email: "pending@example.com", approvalStatus: "pending" }];
  const refreshExam = renderRoute("/exam", user, bank, undefined, (client) => {
    client.getQueryCache().find({ queryKey: examBankQuery("aws-sap").queryKey }).setState({ fetchStatus: "fetching" });
  });
  assert.match(refreshExam, /문항 은행 갱신 중…/);
  assert.match(refreshExam, /레슨 시작/);
  assert.doesNotMatch(refreshExam, /data-slot="skeleton"/);

  const failedExam = renderRoute("/exam", user, bank, undefined, (client) => {
    client.getQueryCache().find({ queryKey: examBankQuery("aws-sap").queryKey }).setState({ status: "error", error: new Error("offline") });
  });
  assert.match(failedExam, /마지막 조회 결과를 표시합니다/);
  assert.match(failedExam, /레슨 시작/);
  assert.match(failedExam, /다시 시도/);

  const refreshAdmin = renderRoute("/admin/users", user, undefined, undefined, (client) => {
    client.setQueryData(pendingUsersQuery().queryKey, users);
    client.getQueryCache().find({ queryKey: pendingUsersQuery().queryKey }).setState({ fetchStatus: "fetching" });
  });
  assert.match(refreshAdmin, /사용자 목록 갱신 중…/);
  assert.match(refreshAdmin, /pending@example.com/);
  assert.doesNotMatch(refreshAdmin, /data-slot="skeleton"/);

  const failedAdmin = renderRoute("/admin/users", user, undefined, undefined, (client) => {
    client.setQueryData(pendingUsersQuery().queryKey, users);
    client.getQueryCache().find({ queryKey: pendingUsersQuery().queryKey }).setState({ status: "error", error: new Error("offline") });
  });
  assert.match(failedAdmin, /마지막 조회 결과를 표시합니다/);
  assert.match(failedAdmin, /pending@example.com/);
  assert.match(failedAdmin, /다시 시도/);
});

test("empty results appear only after loading, while initial errors keep retry actions", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const emptyExam = renderRoute("/exam", user, { subject: "AWS SAP", concepts: [], scenarios: [] });
  assert.match(emptyExam, /학습할 문항이 없습니다/);
  assert.doesNotMatch(emptyExam, /레슨 시작/);

  const emptyAdmin = renderRoute("/admin/users", user, undefined, undefined, (client) => {
    client.setQueryData(pendingUsersQuery().queryKey, []);
  });
  assert.match(emptyAdmin, /현재 승인 대기 중인 사용자가 없습니다/);

  for (const [path, options] of [["/exam", examBankQuery("aws-sap")], ["/admin/users", pendingUsersQuery()]]) {
    const failed = renderRoute(path, user, undefined, undefined, (client) => {
      client.getQueryCache().build(client, options).setState({ status: "error", error: new Error("offline"), fetchStatus: "idle" });
    });
    assert.match(failed, /불러오지 못했습니다/);
    assert.match(failed, /다시 시도/);
    assert.doesNotMatch(failed, /data-slot="skeleton"/);
  }
});

test("access errors still block previously cached exam and admin content", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const forbidden = new ApiError("forbidden", 403, { error: { code: "FORBIDDEN", message: "forbidden" } });
  const exam = renderRoute("/exam", user, { subject: "AWS SAP", concepts: [{ id: "note-1" }], scenarios: [] }, undefined, (client) => {
    client.getQueryCache().find({ queryKey: examBankQuery("aws-sap").queryKey }).setState({ status: "error", error: forbidden });
  });
  assert.match(exam, /문항 은행을 불러오지 못했습니다/);
  assert.doesNotMatch(exam, /레슨 시작/);

  const admin = renderRoute("/admin/users", user, undefined, undefined, (client) => {
    client.setQueryData(pendingUsersQuery().queryKey, [{ id: "2", email: "pending@example.com" }]);
    client.getQueryCache().find({ queryKey: pendingUsersQuery().queryKey }).setState({ status: "error", error: forbidden });
  });
  assert.match(admin, /승인 대기 사용자를 불러오지 못했습니다/);
  assert.doesNotMatch(admin, /pending@example.com/);
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


test("rejected admin responses hide cached pending users inside the shell", () => {
  const user = { id: "1", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
  const rejected = new ApiError("rejected", 403, { error: { code: "SIGNUP_REJECTED", message: "rejected" } });
  const html = renderRoute("/admin/users", user, undefined, undefined, (client) => {
    client.setQueryData(pendingUsersQuery().queryKey, [{ id: "2", email: "private@example.com" }]);
    client.getQueryCache().find({ queryKey: pendingUsersQuery().queryKey }).setState({ status: "error", error: rejected });
  });
  assert.match(html, /Innova Platform/);
  assert.match(html, /승인 대기 사용자를 불러오지 못했습니다/);
  assert.doesNotMatch(html, /private@example.com/);
});
