import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { createMemoryRouter } from "react-router";
import { QueryObserver } from "@tanstack/react-query";
import { createServer } from "vite";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { handlers, resetAuthMock } from "../src/mocks/handlers.ts";

const server = setupServer(...handlers);
const nativeFetch = globalThis.fetch;
const admin = { id: "00000000-0000-4000-8000-000000000010", email: "admin@example.com", role: "admin", approvalStatus: "approved" };
const member = { ...admin, id: "00000000-0000-4000-8000-000000000011", email: "member@example.com", role: "member", approvalStatus: "pending" };
const routers = [], clients = [];
let vite, createAppRoutes, createQueryClient, authenticate, getSessionVersion, examBankQuery, pendingUsersQuery, authKeys, safeReturnTo, examLocation;
const requests = [];
before(async () => {
  server.listen({ onUnhandledRequest: "error" });
  const intercepted = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, "http://localhost");
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return intercepted(url, init);
  };
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ createAppRoutes } = await vite.ssrLoadModule("/src/app/router.tsx"));
  ({ createQueryClient } = await vite.ssrLoadModule("/src/app/query-client.ts"));
  ({ authenticate } = await vite.ssrLoadModule("/src/features/auth/commands.ts"));
  ({ getSessionVersion } = await vite.ssrLoadModule("/src/entities/auth/session-version.ts"));
  ({ examBankQuery } = await vite.ssrLoadModule("/src/entities/exam-bank/queries.ts"));
  ({ pendingUsersQuery } = await vite.ssrLoadModule("/src/entities/admin-users/queries.ts"));
  ({ authKeys } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ safeReturnTo } = await vite.ssrLoadModule("/src/features/auth/route-session.ts"));
  ({ examLocation } = await vite.ssrLoadModule("/src/features/start-lesson/model/exam-location.ts"));
});
after(async () => { await vite?.close(); server.close(); globalThis.fetch = nativeFetch; });
beforeEach(() => { resetAuthMock([{ user: admin, password: "password123" }, { user: member, password: "password123" }]); requests.length = 0; });
afterEach(() => { routers.splice(0).forEach(r => r.dispose()); clients.splice(0).forEach(c => c.clear()); server.resetHandlers(); });
function client() { const c = createQueryClient(); clients.push(c); return c; }
function count(path, method = "GET") { return requests.filter(r => r === `${method} ${path}`).length; }
async function settled(router, predicate = s => s.initialized && s.navigation.state === "idle" && s.revalidation === "idle") {
  if (predicate(router.state)) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("Router did not settle")); }, 4000);
    const unsubscribe = router.subscribe(state => { if (predicate(state)) { clearTimeout(timer); unsubscribe(); resolve(); } });
  });
}
async function router(c, path = "/") {
  const r = createMemoryRouter(createAppRoutes(c), { initialEntries: [path] }); routers.push(r); await settled(r); return r;
}
async function signIn(c, user = admin) { await authenticate(c, "login", { email: user.email, password: "password123" }); }
function form(fields) { const f = new FormData(); Object.entries(fields).forEach(([k,v]) => f.set(k,v)); return f; }

test("middleware guards direct entry for every role/approval combination before protected loaders", async () => {
  for (const [user, examPath, adminPath] of [
    [null, "/login", "/login"], [member, "/approval-pending", "/approval-pending"],
    [{ ...member, approvalStatus: "approved" }, "/exam", "/exam"],
    [{ ...admin, approvalStatus: "pending" }, "/approval-pending", "/admin/users"],
    [admin, "/exam", "/admin/users"], [{ ...admin, approvalStatus: "rejected" }, "/signup-rejected", "/signup-rejected"],
  ]) {
    resetAuthMock(user ? [{ user, password: "password123" }] : []);
    const c = client(); if (user) await signIn(c, user);
    for (const [path, expected] of [["/exam", examPath], ["/admin/users", adminPath]]) {
      const before = requests.length; const r = await router(c, path);
      assert.equal(r.state.location.pathname, expected, `${user?.role}/${user?.approvalStatus} ${path}`);
      assert.equal(r.state.errors, null);
      if (expected !== path) assert.equal(requests.slice(before).filter(x => x.includes("/api/admin/") || x.includes("/api/exam/")).length, 0);
    }
  }
});

test("loader/cache subscriptions avoid duplicate GETs and use freshness plus explicit invalidation", async () => {
  const c = client(); await signIn(c); requests.length = 0;
  const r = await router(c, "/exam");
  assert.equal(count("/api/auth/me"), 1); assert.equal(count("/api/exam/banks/default"), 1);
  assert.equal(r.state.loaderData.exam, null);
  const observer = new QueryObserver(c, { ...examBankQuery("aws-sap", getSessionVersion(c)), enabled: false });
  const stop = observer.subscribe(() => {}); assert.equal(observer.getCurrentResult().isSuccess, true); stop();
  await r.navigate("/"); await r.navigate("/exam?view=review");
  assert.equal(count("/api/exam/banks/default"), 1);
  const options = examBankQuery("aws-sap", getSessionVersion(c));
  c.getQueryCache().find({ queryKey: options.queryKey }).setState({ dataUpdatedAt: Date.now() - 301000 });
  await r.navigate("/"); await r.navigate("/exam"); assert.equal(count("/api/exam/banks/default"), 2);
  await c.invalidateQueries({ queryKey: options.queryKey, refetchType: "none" }); await r.revalidate();
  assert.equal(count("/api/exam/banks/default"), 3);
});

test("action commits approval before failed refresh; failed POST keeps pending user", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/admin/users");
  server.use(http.get("*/api/admin/users/pending", () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "offline" } }, { status: 500 })));
  await r.navigate("/admin/users", { formMethod: "post", formData: form({ intent: "approve", id: member.id }) });
  assert.equal(count(`/api/admin/users/${member.id}/approve`, "POST"), 1);
  assert.deepEqual(c.getQueryData(pendingUsersQuery(getSessionVersion(c)).queryKey), []);
  assert.equal(r.state.errors, null); assert.equal(r.state.actionData.admin.ok, true);
  // A new failed decision may never remove a previously pending row.
  c.setQueryData(pendingUsersQuery(getSessionVersion(c)).queryKey, [member]);
  server.use(http.post("*/api/admin/users/:id/reject", () => HttpResponse.json({ error: { code: "BUSINESS_RULE_VIOLATION", message: "failed" } }, { status: 400 })));
  await r.navigate("/admin/users", { formMethod: "post", formData: form({ intent: "reject", id: member.id }) });
  assert.equal(c.getQueryData(pendingUsersQuery(getSessionVersion(c)).queryKey)[0].id, member.id);
  assert.equal(r.state.actionData.admin.code, "BUSINESS_RULE_VIOLATION");
});

test("concurrent fetchers cannot submit a second decision for the same user", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/admin/users");
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.post("*/api/admin/users/:id/approve", async () => { started.resolve(); await release.promise; return HttpResponse.json({ user: { ...member, approvalStatus: "approved" } }); }));
  const first = r.fetch("decision-a", "admin", "/admin/users", { formMethod: "post", formData: form({ intent: "approve", id: member.id }) });
  await started.promise;
  await r.fetch("decision-b", "admin", "/admin/users", { formMethod: "post", formData: form({ intent: "reject", id: member.id }) });
  assert.equal(count(`/api/admin/users/${member.id}/reject`, "POST"), 0);
  release.resolve(); await first;
  assert.equal(count(`/api/admin/users/${member.id}/approve`, "POST"), 1);
});

test("auth actions validate input, preserve safe returnTo, logout and signup statuses", async () => {
  const c = client(); const r = await router(c, "/login?returnTo=%2Fadmin%2Fusers");
  await r.navigate("/login?returnTo=%2Fadmin%2Fusers", { formMethod: "post", formData: form({ email: "bad", password: "" }) });
  assert.ok(Object.values(r.state.actionData)[0].fields.email); assert.equal(count("/api/auth/login", "POST"), 0);
  await r.navigate("/login?returnTo=%2Fadmin%2Fusers", { formMethod: "post", formData: form({ email: admin.email, password: "password123" }) });
  assert.equal(r.state.location.pathname, "/admin/users");
  await r.navigate("/logout", { formMethod: "post", formData: form({}) }); assert.equal(r.state.location.pathname, "/login");
  assert.equal(c.getQueryData(authKeys.me), null); assert.equal(c.getQueryCache().findAll({ queryKey: ["exam-bank"] }).length, 0);
  await r.navigate("/signup", { formMethod: "post", formData: form({ email: "new@example.com", password: "password123", passwordConfirm: "different" }) });
  assert.equal(count("/api/auth/signup", "POST"), 0);
  await r.navigate("/signup", { formMethod: "post", formData: form({ email: "new@example.com", password: "password123", passwordConfirm: "password123" }) });
  assert.equal(r.state.location.pathname, "/approval-pending");
});

test("auth commands reject overlap and a late login cannot overwrite the next session", async () => {
  const c = client(); const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.post("*/api/auth/login", async () => { started.resolve(); await release.promise; return HttpResponse.json({ user: admin }); }));
  const first = signIn(c).catch(() => "cancelled"); await started.promise;
  await assert.rejects(authenticate(c, "logout"));
  assert.equal(count("/api/auth/logout", "POST"), 0);
  const { cacheAuthenticatedUser } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts");
  cacheAuthenticatedUser(c, { ...member, approvalStatus: "approved" }); release.resolve();
  assert.equal(await first, "cancelled"); assert.equal(c.getQueryData(authKeys.me).id, member.id);
});

test("navigation cancellation shares a query without cancelling other consumers", async () => {
  const c = client(); await signIn(c); const r = await router(c);
  const started = Promise.withResolvers(), release = Promise.withResolvers(); let signal;
  server.use(http.get("*/api/exam/banks/default", async ({ request }) => { signal = request.signal; started.resolve(); await release.promise; return HttpResponse.json({ id: "aws-sap", bank: { subject: "synthetic", concepts: [], scenarios: [] } }); }));
  const navigation = r.navigate("/exam"); await started.promise;
  const shared = c.query(examBankQuery("aws-sap", getSessionVersion(c)));
  await r.navigate("/"); assert.equal(signal.aborted, false);
  release.resolve(); await shared; await navigation;
  assert.equal(r.state.location.pathname, "/"); assert.equal(count("/api/exam/banks/default"), 1);
});

test("URL canonicalization, history restoration and missing-bank retry use route loaders", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/exam?bank=default&view=invalid");
  assert.equal(r.state.location.search, "");
  await r.navigate("/exam?view=units"); await r.navigate("/exam?view=review"); await r.navigate(-1);
  assert.equal(r.state.location.search, "?view=units");
  await r.navigate("/exam?bank=missing"); assert.ok(r.state.errors);
  server.use(http.get("*/api/exam/banks/missing", () => HttpResponse.json({ id: "missing", bank: { subject: "synthetic", concepts: [], scenarios: [] } })));
  await r.revalidate(); assert.equal(r.state.errors, null);
  assert.equal(examLocation(new URL("https://example.com/exam?view=lesson")).view, "home");
  for (const value of ["//evil.test", "/\\evil.test", "https://evil.test", "/login", "/signup-rejected", "/%2f%2fevil.test"]) assert.equal(safeReturnTo(value), "/exam");
});

test("a temporary UI observer unmount cannot cancel a loader read (StrictMode)", async () => {
  const c = client(); const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.get("*/api/auth/me", async () => { started.resolve(); await release.promise; return HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "anonymous" } }, { status: 401 }); }));
  const r = createMemoryRouter(createAppRoutes(c), { initialEntries: ["/"] }); routers.push(r); await started.promise;
  const { currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts");
  const ui = new QueryObserver(c, { ...currentUserQuery(), enabled: false });
  const unsubscribe = ui.subscribe(() => {}); unsubscribe();
  release.resolve(); await settled(r);
  assert.equal(r.state.errors, null); assert.equal(count("/api/auth/me"), 1);
});

test("an old pending GET cannot overwrite a successful admin decision", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/admin/users");
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.get("*/api/admin/users/pending", async () => { started.resolve(); await release.promise; return HttpResponse.json({ users: [member] }); }));
  const options = pendingUsersQuery(getSessionVersion(c));
  const old = c.query(options).catch(() => null); await started.promise;
  const { decideUser } = await vite.ssrLoadModule("/src/features/admin-users/commands.ts");
  await decideUser(c, "approve", member.id); release.resolve(); await old;
  assert.deepEqual(c.getQueryData(options.queryKey), []);
  assert.equal(r.state.errors, null);
});

test("late protected GET after account transition cannot refill a new session", async () => {
  const c = client(); await signIn(c); const r = await router(c);
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  server.use(http.get("*/api/exam/banks/default", async () => { started.resolve(); await release.promise; return HttpResponse.json({ id: "aws-sap", bank: { subject: "old account", concepts: [], scenarios: [] } }); }));
  const oldEpoch = getSessionVersion(c), navigation = r.navigate("/exam"); await started.promise;
  const { cacheAuthenticatedUser } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts");
  cacheAuthenticatedUser(c, { ...member, approvalStatus: "approved" }); release.resolve(); await navigation;
  assert.equal(c.getQueryData(examBankQuery("aws-sap", oldEpoch).queryKey), undefined);
  assert.equal(c.getQueryData(authKeys.me).id, member.id);
});

test("concurrent decisions on different users preserve both confirmed patches", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/admin/users");
  const other = { ...member, id: "00000000-0000-4000-8000-000000000012", email: "other@example.com" };
  c.setQueryData(pendingUsersQuery(getSessionVersion(c)).queryKey, [member, other]);
  server.use(http.post("*/api/admin/users/:id/approve", ({ params }) => HttpResponse.json({ user: { ...member, id: params.id, approvalStatus: "approved" } })));
  const { decideUser } = await vite.ssrLoadModule("/src/features/admin-users/commands.ts");
  await Promise.all([decideUser(c, "approve", member.id), decideUser(c, "approve", other.id)]);
  assert.deepEqual(c.getQueryData(pendingUsersQuery(getSessionVersion(c)).queryKey), []);
  assert.equal(r.state.errors, null);
});

test("multipart import Action seeds a fresh bank and redirects without another bank GET", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/exam?view=settings");
  const bank = c.getQueryData(examBankQuery("aws-sap", getSessionVersion(c)).queryKey).bank;
  const f = new FormData(); f.set("file", new File([JSON.stringify(bank)], "synthetic.json", { type: "application/json" })); f.set("mode", "replace");
  await r.navigate("/exam?view=settings", { formMethod: "post", formEncType: "multipart/form-data", formData: f });
  assert.equal(r.state.errors, null);
  const selected = examLocation(new URL(r.state.location.pathname + r.state.location.search, "http://localhost"));
  assert.notEqual(selected.bankId, "aws-sap");
  assert.equal(c.getQueryData(examBankQuery(selected.bankId, getSessionVersion(c)).queryKey).bank.subject, bank.subject);
  assert.equal(count(`/api/exam/banks/${selected.bankId}`), 0);
  assert.equal(count("/api/exam/banks", "POST"), 1);
});

test("route refresh invalidates only the requested domain while middleware still rechecks auth", async () => {
  const { refreshRoute } = await vite.ssrLoadModule("/src/shared/lib/router-query/use-route-refresh.ts");
  const c = client(); await signIn(c); const r = await router(c, "/exam");
  const epoch = getSessionVersion(c);
  const examKey = examBankQuery("aws-sap", epoch).queryKey;
  const adminKey = pendingUsersQuery(epoch).queryKey;
  const otherKey = examBankQuery("other-bank", epoch).queryKey;
  c.setQueryData(adminKey, [member]); c.setQueryData(otherKey, { id: "other-bank", bank: {} });
  requests.length = 0;
  await refreshRoute(c, [examKey], () => r.revalidate());
  assert.equal(count("/api/exam/banks/default"), 1);
  assert.equal(count("/api/auth/me"), 1);
  assert.equal(count("/api/admin/users/pending"), 0);
  assert.equal(c.getQueryState(adminKey).isInvalidated, false);
  assert.equal(c.getQueryState(otherKey).isInvalidated, false);

  await r.navigate("/admin/users"); requests.length = 0;
  await refreshRoute(c, [adminKey], () => r.revalidate());
  assert.equal(count("/api/admin/users/pending"), 1);
  assert.equal(count("/api/exam/banks/default"), 0);
  assert.equal(c.getQueryState(examKey).isInvalidated, false);
});

const syntheticConcept = (id, term = id) => ({ id, chapter: 1, deck: "synthetic", term, definition: "synthetic definition", rationale: "synthetic rationale" });
const syntheticScenario = (id, stem = id) => ({ id, chapter: 1, stem, choices: ["a", "b", "c"], answerIndex: 0, rationale: "synthetic rationale" });
const syntheticBank = (subject, concepts, scenarios = []) => ({ schema: "sap-drill-bank.v1", subject, source: "synthetic", generatedAt: "2026-10-02", concepts, scenarios });
function importForm(bank, mode = "replace") {
  const f = new FormData();
  f.set("file", new File([JSON.stringify(bank)], "synthetic.json", { type: "application/json" }));
  f.set("mode", mode); return f;
}

test("merge import keeps existing notes, replaces matching IDs and seeds incoming metadata", async () => {
  const c = client(); await signIn(c); const r = await router(c, "/exam?view=settings");
  const current = syntheticBank("old", [syntheticConcept("keep"), syntheticConcept("same", "old")], [syntheticScenario("scenario", "old")]);
  const incoming = syntheticBank("incoming", [syntheticConcept("same", "updated"), syntheticConcept("new")], [syntheticScenario("scenario", "updated"), syntheticScenario("new-scenario")]);
  c.setQueryData(examBankQuery("aws-sap", getSessionVersion(c)).queryKey, { id: "aws-sap", bank: current });
  await r.navigate("/exam?view=settings", { formMethod: "post", formEncType: "multipart/form-data", formData: importForm(incoming, "merge") });
  assert.equal(r.state.errors, null);
  const selected = examLocation(new URL(r.state.location.pathname + r.state.location.search, "http://localhost"));
  const saved = c.getQueryData(examBankQuery(selected.bankId, getSessionVersion(c)).queryKey).bank;
  assert.equal(saved.subject, "incoming");
  assert.deepEqual(saved.concepts.map(n => n.id), ["keep", "same", "new"]);
  assert.equal(saved.concepts[1].term, "updated");
  assert.deepEqual(saved.scenarios.map(n => n.id), ["scenario", "new-scenario"]);
  assert.equal(saved.scenarios[0].stem, "updated");
  assert.equal(count(`/api/exam/banks/${selected.bankId}`), 0);
});

test("import command rejects overlap and a late file read cannot submit for the next session", async () => {
  const { importExamBank } = await vite.ssrLoadModule("/src/features/start-lesson/model/import-bank.ts");
  const { cacheAuthenticatedUser } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts");
  const c = client(); await signIn(c);
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const input = { source: { text: async () => { started.resolve(); return release.promise; } }, mode: "replace", currentBankId: "aws-sap", epoch: getSessionVersion(c), signal: new AbortController().signal };
  requests.length = 0;
  const first = importExamBank(c, input);
  const cancelled = assert.rejects(first, error => error.constructor.name === "CancelledError");
  await started.promise;
  await assert.rejects(importExamBank(c, input), error => error.reason === "busy");
  cacheAuthenticatedUser(c, { ...member, approvalStatus: "approved" });
  release.resolve(JSON.stringify(syntheticBank("synthetic", [syntheticConcept("one")])));
  await cancelled;
  assert.equal(count("/api/exam/banks", "POST"), 0);
  assert.equal(c.getQueryData(authKeys.me).id, member.id);
});
