import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { authResponseSchema } from "@innova/contracts";
import { buildApp } from "../src/app.js";
import type { ExamRepository } from "../src/db/exam.js";
import type { UserRecord, UserRepository } from "../src/db/users.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const errorTestUserId = "f5f8301d-996b-461b-95c9-9a72162023d6";
const exams: ExamRepository = { async find() { return undefined; }, async create() { throw new Error("unused"); } };

function fixture() {
  const records = new Map<string, UserRecord>();
  const users: UserRepository = {
    async findById(id) { return [...records.values()].find((user) => user.id === id); },
    async findByEmail(email) { return records.get(email); },
    async create(email, passwordHash) {
      if (records.has(email)) return undefined;
      const user = { id: randomUUID(), email, passwordHash, approvalStatus: "pending" as const, role: "member" as const };
      records.set(email, user);
      return user;
    },
    async findPending() {
      return [...records.values()].filter((user) => user.approvalStatus === "pending")
        .map(({ id, email, approvalStatus }) => ({ id, email, approvalStatus }));
    },
    async approvePending(id) {
      const user = [...records.values()].find((record) => record.id === id);
      if (!user || user.approvalStatus !== "pending") return undefined;
      const approved = { ...user, approvalStatus: "approved" as const };
      records.set(user.email, approved);
      return approved;
    },
  };
  const app = buildApp({ logger: false, examRepository: exams, userRepository: users, jwtSecret });
  return { app, records };
}

function cookieFrom(response: { headers: Record<string, unknown> }) {
  const value = response.headers["set-cookie"];
  assert.equal(typeof value, "string");
  return value.split(";")[0]!;
}

test("signup validates input, stores Argon2 hash, and signs in with HttpOnly cookie", async (t) => {
  const { app, records } = fixture();
  t.after(() => app.close());
  for (const payload of [
    { email: "invalid", password: "validpass123" },
    { email: "valid@example.com", password: "short" },
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/auth/signup", payload });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_INPUT");
    assert.ok(Array.isArray(response.json().error.details));
    assert.equal("issues" in response.json(), false);
  }
  const missingFields = await app.inject({ method: "POST", url: "/api/auth/signup", payload: {} });
  assert.deepEqual(missingFields.json().error.details, [
    { field: "email", reason: "required" },
    { field: "password", reason: "required" },
  ]);
  const signup = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: " User@Example.com ", password: "validpass123", approvalStatus: "approved", role: "admin" } });
  assert.equal(signup.statusCode, 201);
  authResponseSchema.parse(signup.json());
  assert.equal(signup.json().user.email, "user@example.com");
  assert.deepEqual(Object.keys(signup.json()), ["user"]);
  assert.deepEqual(Object.keys(signup.json().user).sort(), ["approvalStatus", "email", "id", "role"]);
  assert.equal(signup.json().user.approvalStatus, "pending");
  assert.equal(signup.json().user.role, "member");
  const stored = records.get("user@example.com")!;
  assert.notEqual(stored.passwordHash, "validpass123");
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  assert.match(String(signup.headers["set-cookie"]), /HttpOnly/i);
  assert.match(String(signup.headers["set-cookie"]), /SameSite=Lax/i);
  assert.match(String(signup.headers["set-cookie"]), /Max-Age=900/i);
  const token = cookieFrom(signup).split("=")[1]!;
  const payload = app.jwt.verify<{ sub: string; exp: number }>(token);
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "sub"]);
  assert.equal(payload.sub, stored.id);
  assert.ok(payload.exp > Math.floor(Date.now() / 1000));
  const duplicate = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "USER@example.com", password: "anotherpass123" } });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "EMAIL_ALREADY_EXISTS");
});

test("login hides account existence, issues cookie, and me rejects invalid sessions", async (t) => {
  const { app, records } = fixture();
  t.after(() => app.close());
  const signup = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "user@example.com", password: "validpass123" } });
  const userId = signup.json().user.id as string;
  for (const email of ["user@example.com", "missing@example.com"]) {
    const failed = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "wrongpass" } });
    assert.equal(failed.statusCode, 401);
    assert.equal(failed.json().error.code, "INVALID_CREDENTIALS");
  }
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "USER@example.com", password: "validpass123" } });
  assert.equal(login.statusCode, 200);
  authResponseSchema.parse(login.json());
  assert.deepEqual(login.json(), { user: { id: userId, email: "user@example.com", approvalStatus: "pending", role: "member" } });
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/i);
  const cookie = cookieFrom(login);
  const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(me.statusCode, 200);
  authResponseSchema.parse(me.json());
  assert.deepEqual(me.json(), login.json());
  for (const headers of [
    {},
    { cookie: "exam_drill_auth=malformed" },
    { cookie: `exam_drill_auth=${app.jwt.sign({ sub: userId }, { expiresIn: "15m" }).replace(/.{10}$/, "abcdefghij")}` },
    { cookie: `exam_drill_auth=${app.jwt.sign({ sub: userId }, { expiresIn: "-1s" })}` },
    { cookie: `exam_drill_auth=${app.jwt.sign({ sub: randomUUID() }, { expiresIn: "15m" })}` },
    { authorization: `Bearer ${app.jwt.sign({ sub: userId }, { expiresIn: "15m" })}` },
  ]) {
    const denied = await app.inject({ method: "GET", url: "/api/auth/me", headers });
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.json().error.code, "UNAUTHORIZED");
  }
  const notFound = await app.inject({ method: "GET", url: "/api/auth/missing" });
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.json().error.code, "NOT_FOUND");
  const apiRootNotFound = await app.inject({ method: "GET", url: "/api" });
  assert.equal(apiRootNotFound.statusCode, 404);
  assert.equal(apiRootNotFound.json().error.code, "NOT_FOUND");
  records.delete("user@example.com");
  const deleted = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(deleted.statusCode, 401);
});

test("Fastify parsing errors serialize as INVALID_INPUT and unexpected errors as INTERNAL_ERROR", async (t) => {
  const failingExams: ExamRepository = {
    async find() { throw new Error("private database detail"); },
    async create() { throw new Error("private database detail"); },
  };
  const app = buildApp({ logger: false, examRepository: failingExams, userRepository: {
    async findById(id) { return id === errorTestUserId ? { id, email: "exam@example.com", passwordHash: "unused", approvalStatus: "approved", role: "member" } : undefined; },
    async findByEmail() { return undefined; },
    async create() { return undefined; },
    async findPending() { return []; },
    async approvePending() { return undefined; },
  }, jwtSecret });
  t.after(() => app.close());
  await app.ready();
  const cookie = `exam_drill_auth=${app.jwt.sign({ sub: errorTestUserId }, { expiresIn: "15m" })}`;
  const malformed = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: "{" });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, "INVALID_INPUT");
  const failed = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { cookie } });
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.json(), { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
});

test("logout clears cookie and is idempotent", async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const signup = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "user@example.com", password: "validpass123" } });
  const cookie = cookieFrom(signup);
  for (const headers of [{ cookie }, {}]) {
    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
    assert.equal(logout.statusCode, 204);
    assert.match(String(logout.headers["set-cookie"]), /exam_drill_auth=;/);
    assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/i);
  }
  const me = await app.inject({ method: "GET", url: "/api/auth/me" });
  assert.equal(me.statusCode, 401);
});
