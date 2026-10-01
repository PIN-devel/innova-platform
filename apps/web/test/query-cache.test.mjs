import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { QueryObserver } from "@tanstack/react-query";
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
let createQueryClient;
let decideUser;
let getSessionVersion;

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
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ examBankKeys, examBankQuery } = await vite.ssrLoadModule("/src/entities/exam-bank/queries.ts"));
  ({ adminUserKeys, pendingUsersQuery } = await vite.ssrLoadModule("/src/entities/admin-users/queries.ts"));
  ({ createCachedExamBank } = await vite.ssrLoadModule("/src/features/start-lesson/model/import-bank.ts"));
  ({ approveUser, rejectUser } = await vite.ssrLoadModule("/src/entities/admin-users/api.ts"));
  invalidatePendingUsers = client => client.invalidateQueries({ queryKey: adminUserKeys.all });
  refreshDefaultExamBank = async client => {
    const options = examBankQuery("aws-sap", getSessionVersion(client));
    await client.invalidateQueries({ queryKey: options.queryKey, refetchType: "none" });
    return client.query(options);
  };
  ({ authKeys, currentUserQuery } = await vite.ssrLoadModule("/src/entities/auth/queries.ts"));
  ({ login, logout } = await vite.ssrLoadModule("/src/entities/auth/api.ts"));
  ({ cacheAuthenticatedUser, clearProtectedQueries, clearSessionCache } = await vite.ssrLoadModule("/src/features/auth/clear-protected-queries.ts"));
  const appQueries = await vite.ssrLoadModule("/src/app/query-client.ts");
  createQueryClient = appQueries.createQueryClient;
  ({ decideUser } = await vite.ssrLoadModule("/src/features/admin-users/commands.ts"));
  ({ getSessionVersion } = await vite.ssrLoadModule("/src/entities/auth/session-version.ts"));
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
  const client = createQueryClient();
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
  const options = examBankQuery("aws-sap", getSessionVersion(client));
  assert.deepEqual(options.queryKey, examBankKeys.detail("aws-sap", getSessionVersion(client)));
  assert.equal(options.staleTime, 5 * 60 * 1000);
  assert.equal(options.gcTime, 30 * 60 * 1000);
  assert.equal(options.retry, false);
  assert.equal(currentUserQuery().staleTime, 0);
  assert.equal(pendingUsersQuery(getSessionVersion(client)).staleTime, 0);

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

  const query = client.getQueryCache().find({ queryKey: examBankKeys.detail("aws-sap", getSessionVersion(client)) });
  query.setState({ dataUpdatedAt: Date.now() - 5 * 60 * 1000 - 1000 });
  const stale = new QueryObserver(client, options);
  const stopStale = stale.subscribe(() => {});
  await waitForQuery(stale, (result) => result.isSuccess && !result.isFetching);
  stopStale();
  assert.equal(requests.exam, 2);
});

test("auth revalidation clears protected data on expiry, account change, and permission change", async () => {
  for (const next of [null, adminB, { ...adminA, role: "member" }, { ...adminA, approvalStatus: "rejected" }]) {
    const client = makeClient();
    cacheAuthenticatedUser(client, adminA);
    client.setQueryData(adminUserKeys.pending(getSessionVersion(client)), [memberA]);
    client.setQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client)), { bank: {} });
    server.use(http.get("*/api/auth/me", () => next
      ? HttpResponse.json({ user: next })
      : HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "Expired" } }, { status: 401 })));
    await client.fetchQuery(currentUserQuery());
    assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);
    assert.equal(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), undefined);
  }
});

test("unchanged auth revalidation preserves fresh bank data", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, await login({ email: adminA.email, password: "password123" }));
  const bank = await client.fetchQuery(examBankQuery("aws-sap", getSessionVersion(client)));
  await client.fetchQuery(currentUserQuery());
  assert.deepEqual(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), bank);
  await client.fetchQuery(examBankQuery("aws-sap", getSessionVersion(client)));
  assert.equal(requests.exam, 1);
});

test("a protected GET in flight is cancelled at logout and cannot restore its data", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, adminA);
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  let requestSignal;
  server.use(http.get("*/api/admin/users/pending", async ({ request }) => {
    requestSignal = request.signal;
    started.resolve();
    await response.promise;
    return HttpResponse.json({ users: [memberA] });
  }));
  const lookup = client.fetchQuery(pendingUsersQuery(getSessionVersion(client))).catch(() => null);
  await started.promise;
  clearSessionCache(client);
  response.resolve();
  await lookup;
  assert.equal(requestSignal.aborted, true);
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);
});

test("a late auth lookup cannot overwrite a newly authenticated account", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, adminA);
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  server.use(http.get("*/api/auth/me", async () => {
    started.resolve();
    await response.promise;
    return HttpResponse.json({ user: adminA });
  }));
  const lookup = client.fetchQuery(currentUserQuery()).catch(() => null);
  await started.promise;
  cacheAuthenticatedUser(client, adminB);
  response.resolve();
  await lookup;
  assert.equal(client.getQueryData(authKeys.me).id, adminB.id);
});

test("an import completing after logout cannot repopulate protected cache", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, adminA);
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  server.use(http.post("*/api/exam/banks", async () => {
    started.resolve();
    await response.promise;
    return HttpResponse.json({ id: "late-import", bank: {} }, { status: 201 });
  }));
  const save = createCachedExamBank(client, {}).then(() => "saved", () => "cancelled");
  await started.promise;
  clearSessionCache(client);
  response.resolve();
  assert.equal(await save, "cancelled");
  assert.equal(client.getQueryData(examBankKeys.detail("late-import", getSessionVersion(client))), undefined);
});

test("protected query errors update the session, but network failures retain usable data", async () => {
  for (const code of ["UNAUTHORIZED", "SIGNUP_REJECTED", "FORBIDDEN", "INTERNAL_ERROR"]) {
    const client = makeClient();
    cacheAuthenticatedUser(client, adminA);
    client.setQueryData(adminUserKeys.pending(getSessionVersion(client)), [memberA]);
    server.use(http.get("*/api/admin/users/pending", () => HttpResponse.json({ error: { code, message: code } }, { status: code === "UNAUTHORIZED" ? 401 : code === "INTERNAL_ERROR" ? 500 : 403 })));
    await assert.rejects(client.fetchQuery(pendingUsersQuery(getSessionVersion(client))));
    if (code === "INTERNAL_ERROR") assert.deepEqual(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), [memberA]);
    else assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);
    if (code === "UNAUTHORIZED") assert.equal(client.getQueryData(authKeys.me), null);
    if (code === "SIGNUP_REJECTED") assert.equal(client.getQueryData(authKeys.me).approvalStatus, "rejected");
  }
});

test("successful rejection is retained when list refresh fails", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, await login({ email: adminA.email, password: "password123" }));
  const observer = new QueryObserver(client, pendingUsersQuery(getSessionVersion(client)));
  const stop = observer.subscribe(() => {});
  await waitForQuery(observer, (result) => result.isSuccess && !result.isFetching);
  server.use(http.get("*/api/admin/users/pending", () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unavailable" } }, { status: 500 })));
  await decideUser(client, "reject", memberA.id);
  await client.query(pendingUsersQuery(getSessionVersion(client))).catch(() => {});
  assert.equal(observer.getCurrentResult().isError, true);
  assert.deepEqual(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))).map((user) => user.id), [memberB.id]);
  stop();
});

test("self-rejection updates the shell identity immediately", async () => {
  const client = makeClient();
  const pendingAdmin = { ...adminA, approvalStatus: "pending" };
  resetAuthMock([{ user: pendingAdmin, password: "password123" }]);
  cacheAuthenticatedUser(client, await login({ email: adminA.email, password: "password123" }));
  client.setQueryData(adminUserKeys.pending(getSessionVersion(client)), [pendingAdmin]);
  await decideUser(client, "reject", adminA.id);
  assert.equal(client.getQueryData(authKeys.me).approvalStatus, "rejected");
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);
});

test("a late admin mutation error cannot sign out the next account", async () => {
  const client = makeClient();
  cacheAuthenticatedUser(client, adminA);
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  server.use(http.post("*/api/admin/users/:id/reject", async () => {
    started.resolve();
    await response.promise;
    return HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "Expired" } }, { status: 401 });
  }));
  const mutation = decideUser(client, "reject", memberA.id).catch(() => null);
  await started.promise;
  cacheAuthenticatedUser(client, adminB);
  response.resolve();
  await mutation;
  assert.equal(client.getQueryData(authKeys.me).id, adminB.id);
});

test("created bank and explicit default refresh use the Query cache without a second GET", async () => {
  await login({ email: adminA.email, password: "password123" });
  const client = makeClient();
  const seed = await client.fetchQuery(examBankQuery("aws-sap", getSessionVersion(client)));
  assert.equal(requests.exam, 1);

  const created = await createCachedExamBank(client, seed.bank);
  const createdObserver = new QueryObserver(client, examBankQuery(created.id, getSessionVersion(client)));
  const stopCreated = createdObserver.subscribe(() => {});
  assert.equal(createdObserver.getCurrentResult().isFetching, false);
  assert.deepEqual(client.getQueryData(examBankKeys.detail(created.id, getSessionVersion(client))), created);
  assert.equal(requests.exam, 1);
  stopCreated();

  await refreshDefaultExamBank(client);
  assert.equal(requests.exam, 2);
  const defaultObserver = new QueryObserver(client, examBankQuery("aws-sap", getSessionVersion(client)));
  const stopDefault = defaultObserver.subscribe(() => {});
  assert.equal(defaultObserver.getCurrentResult().isFetching, false);
  assert.equal(requests.exam, 2);
  stopDefault();

  server.use(http.get("*/api/exam/banks/default", () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unavailable" } }, { status: 500 })));
  await assert.rejects(refreshDefaultExamBank(client));
  assert.equal(requests.exam, 3);
  assert.deepEqual(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), seed);
});

test("admin list remains immediately stale and approval or rejection invalidates the active list", async () => {
  await login({ email: adminA.email, password: "password123" });
  const client = makeClient();
  const observer = new QueryObserver(client, pendingUsersQuery(getSessionVersion(client)));
  const stop = observer.subscribe(() => {});
  await waitForQuery(observer, (result) => result.isSuccess && !result.isFetching);
  assert.equal(requests.admin, 1);
  assert.equal(observer.getCurrentResult().data.length, 2);

  const revisited = new QueryObserver(client, pendingUsersQuery(getSessionVersion(client)));
  const stopRevisited = revisited.subscribe(() => {});
  await waitForQuery(revisited, (result) => result.isSuccess && !result.isFetching);
  assert.equal(requests.admin, 2);
  stopRevisited();

  await approveUser(memberA.id);
  const afterApproval = waitForQuery(observer, (result) => result.isSuccess && !result.isFetching && result.data.length === 1);
  await invalidatePendingUsers(client);
  await afterApproval;
  assert.equal(requests.admin, 3);
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client)))[0].id, memberB.id);

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
  const bank = await client.fetchQuery(examBankQuery("aws-sap", getSessionVersion(client)));
  client.setQueryData(adminUserKeys.pending(getSessionVersion(client)), [{ id: memberA.id, email: memberA.email }]);
  assert.equal(client.getQueryData(authKeys.me).id, adminA.id);

  cacheAuthenticatedUser(client, await login({ email: adminB.email, password: "password123" }));
  assert.equal(client.getQueryData(authKeys.me).id, adminB.id);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);

  client.setQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client)), bank);
  client.setQueryData(adminUserKeys.pending(getSessionVersion(client)), []);
  clearProtectedQueries(client);
  client.setQueryData(authKeys.me, null);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);

  await logout();
  clearSessionCache(client);
  assert.equal(client.getQueryData(authKeys.me), null);
  assert.equal(client.getQueryData(examBankKeys.detail("aws-sap", getSessionVersion(client))), undefined);
  assert.equal(client.getQueryData(adminUserKeys.pending(getSessionVersion(client))), undefined);
});
