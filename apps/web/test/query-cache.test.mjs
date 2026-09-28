import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createServer } from "vite";
import { handlers, resetAuthMock } from "../src/mocks/handlers.ts";

const server = setupServer(...handlers);
const nativeFetch = globalThis.fetch;
const clients = [];
const requests = { exam: 0, admin: 0 };
let vite;
let examBankKeys;
let examBankQuery;
let createCachedExamBank;
let refreshDefaultExamBank;
let adminUserKeys;
let pendingUsersQuery;
let invalidatePendingUsers;
let approveUser;
let rejectUser;
let authKeys;
let currentUserQuery;
let login;
let logout;
let cacheAuthenticatedUser;
let clearProtectedQueries;
let clearSessionCache;

const adminA = { id: "00000000-0000-4000-8000-000000000010", email: "admin-a@example.com", approvalStatus: "approved", role: "admin" };
const adminB = { id: "00000000-0000-4000-8000-000000000011", email: "admin-b@example.com", approvalStatus: "approved", role: "admin" };
const memberA = { id: "00000000-0000-4000-8000-000000000012", email: "member-a@example.com", approvalStatus: "pending", role: "member" };
const memberB = { id: "00000000-0000-4000-8000-000000000013", email: "member-b@example.com", approvalStatus: "pending", role: "member" };

before(async () => {
  server.listen({ onUnhandledRequest: "error" });
  const interceptedFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, "http://localhost");
    const method = init?.method ?? "GET";
    if (method === "GET" && url.pathname.startsWith("/api/exam/banks/")) requests.exam++;
    if (method === "GET" && url.pathname === "/api/admin/users/pending") requests.admin++;
    return interceptedFetch(url.toString(), init);
  };
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  ({ examBankKeys, examBankQuery, createCachedExamBank, refreshDefaultExamBank } = await vite.ssrLoadModule("/src/entities/exam-bank/queries.ts"));
  ({ adminUserKeys, pendingUsersQuery, invalidatePendingUsers, approveUser, rejectUser } = await vite.ssrLoadModule("/src/entities/admin-users/queries.ts"));
  ({ authKeys, currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ login, logout } = await vite.ssrLoadModule("/src/entities/auth/api.ts"));
  ({ cacheAuthenticatedUser, clearProtectedQueries, clearSessionCache } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts"));
});
after(async () => { await vite?.close(); server.close(); globalThis.fetch = nativeFetch; });
beforeEach(() => {
  resetAuthMock([
    { user: adminA, password: "password123" },
    { user: adminB, password: "password123" },
    { user: memberA, password: "password123" },
    { user: memberB, password: "password123" },
  ]);
  requests.exam = 0;
  requests.admin = 0;
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); server.resetHandlers(); });

function makeClient() {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

function waitForQuery(observer, predicate) {
  if (predicate(observer.getCurrentResult())) return Promise.resolve(observer.getCurrentResult());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("Query did not settle")); }, 2000);
    const unsubscribe = observer.subscribe((result) => {
      if (!predicate(result)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    });
  });
}

test("exam bank uses one GET on first visit, reuses fresh data, and revalidates stale data", async () => {
  await login({ email: adminA.email, password: "password123" });
  const client = makeClient();
  const options = examBankQuery("aws-sap");
  assert.deepEqual(options.queryKey, examBankKeys.detail("aws-sap"));
  assert.equal(options.staleTime, 5 * 60 * 1000);
  assert.equal(options.gcTime, 30 * 60 * 1000);
  assert.equal(options.retry, false);
  assert.equal(currentUserQuery().staleTime, 0);
  assert.equal(pendingUsersQuery().staleTime, 0);

  const first = new QueryObserver(client, options);
  const stopFirst = first.subscribe(() => {});
  await waitForQuery(first, (result) => result.isSuccess && !result.isFetching);
  stopFirst();
  assert.equal(requests.exam, 1);

  const fresh = new QueryObserver(client, options);
  const stopFresh = fresh.subscribe(() => {});
  assert.equal(fresh.getCurrentResult().isFetching, false);
  assert.equal(requests.exam, 1);
  stopFresh();

  const query = client.getQueryCache().find({ queryKey: examBankKeys.detail("aws-sap") });
  query.setState({ dataUpdatedAt: Date.now() - 5 * 60 * 1000 - 1000 });
  const stale = new QueryObserver(client, options);
  const stopStale = stale.subscribe(() => {});
  await waitForQuery(stale, (result) => result.isSuccess && !result.isFetching);
  stopStale();
  assert.equal(requests.exam, 2);
});

test("created bank and explicit default refresh use the Query cache without a second GET", async () => {
  await login({ email: adminA.email, password: "password123" });
  const client = makeClient();
  const seed = await client.fetchQuery(examBankQuery("aws-sap"));
  assert.equal(requests.exam, 1);

  const created = await createCachedExamBank(client, seed.bank);
  const createdObserver = new QueryObserver(client, examBankQuery(created.id));
  const stopCreated = createdObserver.subscribe(() => {});
  assert.equal(createdObserver.getCurrentResult().isFetching, false);
  assert.deepEqual(client.getQueryData(examBankKeys.detail(created.id)), created);
  assert.equal(requests.exam, 1);
  stopCreated();

  await refreshDefaultExamBank(client);
  assert.equal(requests.exam, 2);
  const defaultObserver = new QueryObserver(client, examBankQuery("aws-sap"));
  const stopDefault = defaultObserver.subscribe(() => {});
  assert.equal(defaultObserver.getCurrentResult().isFetching, false);
  assert.equal(requests.exam, 2);
  stopDefault();

  server.use(http.get("*/api/exam/banks/default", () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unavailable" } }, { status: 500 })));
  await assert.rejects(refreshDefaultExamBank(client));
  assert.equal(requests.exam, 3);
  assert.deepEqual(client.getQueryData(examBankKeys.detail("aws-sap")), seed);
});

test("admin list remains immediately stale and approval or rejection invalidates the active list", async () => {
  await login({ email: adminA.email, password: "password123" });
  const client = makeClient();
  const observer = new QueryObserver(client, pendingUsersQuery());
  const stop = observer.subscribe(() => {});
  await waitForQuery(observer, (result) => result.isSuccess && !result.isFetching);
  assert.equal(requests.admin, 1);
  assert.equal(observer.getCurrentResult().data.length, 2);

  const revisited = new QueryObserver(client, pendingUsersQuery());
  const stopRevisited = revisited.subscribe(() => {});
  await waitForQuery(revisited, (result) => result.isSuccess && !result.isFetching);
  assert.equal(requests.admin, 2);
  stopRevisited();

  await approveUser(memberA.id);
  const afterApproval = waitForQuery(observer, (result) => result.isSuccess && !result.isFetching && result.data.length === 1);
  await invalidatePendingUsers(client);
  await afterApproval;
  assert.equal(requests.admin, 3);
  assert.equal(client.getQueryData(adminUserKeys.pending)[0].id, memberB.id);

  await rejectUser(memberB.id);
  const afterRejection = waitForQuery(observer, (result) => result.isSuccess && !result.isFetching && result.data.length === 0);
  await invalidatePendingUsers(client);
  await afterRejection;
  assert.equal(requests.admin, 4);
  stop();
});

test("logout, session invalidation, and login as another user discard protected cache", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, await login({ email: adminA.email, password: "password123" }));
  const bank = await client.fetchQuery(examBankQuery("aws-sap"));
  client.setQueryData(adminUserKeys.pending, [{ id: memberA.id, email: memberA.email }]);
  assert.equal(client.getQueryData(authKeys.me).id, adminA.id);

  cacheAuthenticatedUser(client, await login({ email: adminB.email, password: "password123" }));
  assert.equal(client.getQueryData(authKeys.me).id, adminB.id);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap")), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending), undefined);

  client.setQueryData(examBankKeys.detail("aws-sap"), bank);
  client.setQueryData(adminUserKeys.pending, []);
  clearProtectedQueries(client);
  client.setQueryData(authKeys.me, null);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap")), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending), undefined);

  await logout();
  clearSessionCache(client);
  assert.equal(client.getQueryData(authKeys.me), null);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap")), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending), undefined);
});
