import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import type { UserLookup } from "../src/db/users.js";
import type { ExamRepository } from "../src/db/exam.js";
import type { CurriculumReadRepository } from "../src/db/curriculum-read.js";

const JWT_SECRET = "synthetic-learning-secret-with-32-chars";
const userId = "00000000-0000-4000-8000-000000000001";

test("routes-scope: mounts exam & curriculum, enforces approval guard, and isolates other domains with 404", async (t) => {
  let approvalStatus: "approved" | "pending" | "rejected" = "approved";
  const mockUserLookup: UserLookup = {
    async findById(id) {
      if (id !== userId) return undefined;
      return {
        id,
        email: "student@example.com",
        role: "member",
        approvalStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  };

  const mockExamRepo: ExamRepository = {
    async find(id) {
      if (id === "aws-sap") {
        return {
          id: "aws-sap",
          bank: {
            schema: "exam-bank.v1",
            subject: "AWS SAP",
            source: "synthetic",
            generatedAt: "2026-01-01",
            concepts: [],
            scenarios: [],
          },
        };
      }
      return undefined;
    },
    async create() { throw new Error("not implemented"); },
  };

  const mockCurriculumRepo: CurriculumReadRepository = {
    async subjects() { return []; },
    async subject() { return undefined; },
    async chapters() { return []; },
    async chapter() { return undefined; },
    async questions() { return []; },
  };

  const app = buildApp({
    logger: false,
    jwtSecret: JWT_SECRET,
    userLookup: mockUserLookup,
    examRepository: mockExamRepo,
    curriculumRepository: mockCurriculumRepo,
    curriculumAssets: async () => undefined,
    readinessCheck: async () => ({ status: "ready" }),
  });

  t.after(() => app.close());
  await app.ready();

  const authHeader = {
    cookie: `innova_auth=${app.jwt.sign({ sub: userId })}`,
  };

  // 1. Health and readiness endpoints
  for (const url of ["/health", "/api/health"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  }

  for (const url of ["/ready", "/api/ready"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ready" });
  }

  // 2. Authentication & Approval status tests on Learning endpoints
  for (const status of [null, "pending", "rejected"] as const) {
    if (status) approvalStatus = status;
    const headers = status ? authHeader : {};

    const examRes = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });
    assert.equal(examRes.statusCode, status ? 403 : 401);
    assert.equal(examRes.headers["cache-control"], "no-store");
    assert.equal(examRes.headers.vary, "Cookie");

    const currRes = await app.inject({ method: "GET", url: "/api/curriculum/subjects", headers });
    assert.equal(currRes.statusCode, status ? 403 : 401);
  }

  // Approved user can access learning endpoints
  approvalStatus = "approved";
  const examOk = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: authHeader });
  assert.equal(examOk.statusCode, 200);
  assert.equal(examOk.json().id, "aws-sap");

  const currOk = await app.inject({ method: "GET", url: "/api/curriculum/subjects", headers: authHeader });
  assert.equal(currOk.statusCode, 200);
  assert.deepEqual(currOk.json(), { subjects: [] });

  // 3. Domain isolation: Auth, Admin, Finance, AI endpoints return 404 NOT_FOUND
  const foreignRoutes = [
    "/api/auth/me",
    "/api/auth/login",
    "/api/admin/users",
    "/api/finance/raw",
    "/api/finance/business",
    "/api/finance/transactions",
    "/api/ai/chat",
  ];

  for (const url of foreignRoutes) {
    const res = await app.inject({ method: "GET", url, headers: authHeader });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, "NOT_FOUND");
    assert.equal(res.json().error.message, "API route not found");
  }
});
