import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createServer } from "vite";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { handlers, resetAuthMock } from "../src/mocks/handlers.ts";

const server = setupServer(...handlers);
const nativeFetch = globalThis.fetch;
const user = { id: "00000000-0000-4000-8000-000000000010", email: "sample@example.com", role: "member", approvalStatus: "approved" };
const path = "/exam?subject=synthetic-curriculum&chapter=sample-chapter";
const calls = [], clients = [], routers = [];
let vite, createAppRoutes, createQueryClient, authenticate, getSessionVersion, queries, submitAnswer, cacheAuthenticatedUser;
before(async () => {
  server.listen({ onUnhandledRequest: "error" }); const intercepted = globalThis.fetch;
  globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input.url, "http://localhost"); calls.push(`${init?.method ?? "GET"} ${url.pathname}`); return intercepted(url, init); };
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ createAppRoutes } = await vite.ssrLoadModule("/src/app/router.tsx"));
  ({ createQueryClient } = await vite.ssrLoadModule("/src/app/query-client.ts"));
  ({ authenticate } = await vite.ssrLoadModule("/src/features/auth/commands.ts"));
  ({ getSessionVersion } = await vite.ssrLoadModule("/src/entities/auth/session-version.ts"));
  queries = await vite.ssrLoadModule("/src/entities/curriculum/queries.ts");
  ({ submitAnswer } = await vite.ssrLoadModule("/src/features/study-curriculum/submit-answer.ts"));
  ({ cacheAuthenticatedUser } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts"));
});
after(async () => { await vite?.close(); server.close(); globalThis.fetch = nativeFetch; });
beforeEach(() => { resetAuthMock([{ user, password: "password123" }]); calls.length = 0; });
afterEach(() => { routers.splice(0).forEach((r) => r.dispose()); clients.splice(0).forEach((c) => c.clear()); server.resetHandlers(); });
function client() { const c = createQueryClient(); clients.push(c); return c; }
async function settle(r) {
  if (r.state.initialized && r.state.navigation.state === "idle" && r.state.revalidation === "idle") return;
  await new Promise((resolve, reject) => { const timer = setTimeout(() => { stop(); reject(new Error("Router timeout")); }, 4000); const stop = r.subscribe((s) => { if (s.initialized && s.navigation.state === "idle" && s.revalidation === "idle") { clearTimeout(timer); stop(); resolve(); } }); });
}
async function router(c, entry) { const r = createMemoryRouter(createAppRoutes(c), { initialEntries: [entry] }); routers.push(r); await settle(r); return r; }
function render(c, r) { return renderToStaticMarkup(createElement(QueryClientProvider, { client: c }, createElement(RouterProvider, { router: r }))); }
function form(kind, value, id) {
  const f = new FormData(); f.set("intent", "curriculum-grade"); f.set("kind", kind); f.set("questionId", id);
  f.set(kind === "short-answer" ? "text" : "choiceIds", value); return f;
}

test("Curriculum direct entry obeys approval before any protected read", async () => {
  for (const status of [null, "pending", "rejected"]) {
    resetAuthMock(status ? [{ user: { ...user, approvalStatus: status }, password: "password123" }] : []);
    const c = client(); if (status) await authenticate(c, "login", { email: user.email, password: "password123" }); calls.length = 0;
    const r = await router(c, path);
    assert.equal(r.state.location.pathname, status === "pending" ? "/approval-pending" : status === "rejected" ? "/signup-rejected" : "/login");
    assert.equal(calls.filter((s) => s.includes("/curriculum/")).length, 0);
  }
});
test("Subject selection, Chapter/Section navigation and reading renderer preserve explicit parent-child-parent order", async () => {
  const c = client(); await authenticate(c, "login", { email: user.email, password: "password123" });
  const r = await router(c, "/exam?subject=synthetic-curriculum");
  assert.match(render(c, r), /Chapter 선택|Synthetic Chapter/);
  await r.navigate(path); assert.equal(r.state.errors, null);
  const html = render(c, r);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.match(html, /aria-label="과목 선택"/); assert.match(html, /aria-label="Section 탐색"/);
  assert.ok(html.indexOf('data-block-id="sample-before"') < html.indexOf('data-block-id="sample-child-body"'));
  assert.ok(html.indexOf('data-block-id="sample-child-body"') < html.indexOf('data-block-id="sample-after"'));
  assert.match(html, /<code[^>]*>const sample = 1;/); assert.match(html, /colSpan="2"|colspan="2"/);
  assert.match(html, /blocks\/sample-child-body\/assets\/2/); assert.doesNotMatch(html, /src="[^"]*(?:private-data|synthetic\/sample\.png)/);
  assert.equal(calls.filter((s) => s === "GET /api/curriculum/subjects").length, 1);
  await r.navigate(path + "&view=quiz");
  assert.equal(r.state.errors, null); assert.match(render(c, r), /Sample A/);
  const quiz = c.getQueryData(queries.curriculumQuizQuery("synthetic-curriculum", "sample-chapter", getSessionVersion(c)).queryKey);
  assert.equal(quiz.questions.length, 2); assert.ok(quiz.questions.every((q) => !q.answer));
  await r.navigate(path);
  assert.equal(calls.filter((s) => s === "GET /api/curriculum/subjects/synthetic-curriculum/chapters/sample-chapter").length, 1);
});
test("Router answer Action grades choice and exact short answer without trimming and preserves evidence/explanation", async () => {
  const c = client(); await authenticate(c, "login", { email: user.email, password: "password123" });
  const r = await router(c, path + "&view=quiz");
  r.getFetcher("grade");
  for (const [kind, value, id, correct] of [
    ["single-choice", "sample-a", "sample-choice", true], ["single-choice", "sample-b", "sample-choice", false],
    ["short-answer", "Sample", "sample-short", true], ["short-answer", "sample", "sample-short", false], ["short-answer", "Sample ", "sample-short", false],
  ]) {
    let result;
    const stop = r.subscribe((s) => { const f = s.fetchers.get("grade"); if (f?.data) result = f.data; });
    await r.fetch("grade", "exam", path + "&view=quiz", { formMethod: "post", formData: form(kind, value, id) });
    assert.equal(r.state.errors, null);
    stop();
    assert.equal(result.grade.correct, correct); assert.deepEqual(result.grade.answer.sourceBlockIds, ["sample-answer"]);
    assert.equal(result.grade.answer.explanation[0].text, "Synthetic explanation");
  }
  assert.equal(calls.filter((s) => s === "GET /api/curriculum/subjects/synthetic-curriculum/chapters/sample-chapter/quiz").length, 1);
});
test("session transition removes Curriculum caches and rejects late grading results", async () => {
  const c = client(); await authenticate(c, "login", { email: user.email, password: "password123" }); await router(c, path);
  const epoch = getSessionVersion(c); const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.post("*/api/curriculum/subjects/:subjectId/chapters/:chapterId/questions/:questionId/grade", async () => { started.resolve(); await release.promise; return HttpResponse.json({ questionId: "sample-short", correct: true, answer: { status: "official", acceptedAnswers: ["Sample"], matching: "exact", sourceBlockIds: ["sample-answer"] } }); }));
  const pending = submitAnswer(c, epoch, "synthetic-curriculum", "sample-chapter", "sample-short", { kind: "short-answer", text: "Sample" });
  await started.promise;
  cacheAuthenticatedUser(c, { ...user, id: "00000000-0000-4000-8000-000000000020" });
  assert.equal(c.getQueryCache().findAll({ queryKey: queries.curriculumKeys.all }).length, 0);
  release.resolve(); await assert.rejects(pending);
});
test("MSW Curriculum API returns no-store and blocks private assets and answers for revoked approval", async () => {
  await fetch("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "password123" }) });
  const url = "http://localhost/api/curriculum/subjects/synthetic-curriculum/chapters/sample-chapter";
  const response = await fetch(url); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("vary"), "Cookie");
  resetAuthMock([{ user: { ...user, approvalStatus: "pending" }, password: "password123" }]);
  await fetch("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "password123" }) });
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url + "/blocks/sample-child-body/assets/2")).status, 403);
  assert.equal((await fetch(url + "/questions/sample-short/grade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "short-answer", text: "Sample" }) })).status, 403);
});
