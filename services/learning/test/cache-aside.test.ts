import assert from "node:assert/strict";
import { test } from "node:test";
import type { CacheStore } from "@innova/auth-kit";
import { createInMemoryCacheStore } from "@innova/auth-kit";
import type { ExamBank } from "@innova/contracts";
import { buildApp } from "../src/app.js";
import type { CurriculumReadRepository } from "../src/db/curriculum-read.js";
import type { ExamRepository } from "../src/db/exam.js";
import type { UserLookup } from "../src/db/users.js";

const userId = "00000000-0000-4000-8000-000000000001";
const sampleBank: ExamBank = {
  schema: "sap-drill-bank.v1",
  subject: "AWS SAP",
  source: "synthetic",
  generatedAt: "2026-11-13T00:00:00.000Z",
  concepts: [
    {
      id: "concept-1",
      chapter: 1,
      deck: "synthetic",
      term: "Synthetic Term",
      termAliases: [],
      definition: "Synthetic definition",
      rationale: "Synthetic rationale",
      tags: [],
      difficulty: 1,
    },
  ],
  scenarios: [],
};

const emptyCurriculum: CurriculumReadRepository = {
  async subjects() { return []; },
  async subject() { return undefined; },
  async chapters() { return []; },
  async chapter() { return undefined; },
  async questions() { return []; },
};

test("Learning service applies Cache-Aside to UserLookup and ExamRepository", async (t) => {
  let userLookupCalls = 0;
  let examFindCalls = 0;
  const storedBanks = new Map([["aws-sap", { id: "aws-sap", bank: sampleBank }]]);

  const userLookup: UserLookup = {
    async findById(id) {
      userLookupCalls += 1;
      return id === userId
        ? { id, email: "learner@example.com", role: "member", approvalStatus: "approved" }
        : undefined;
    },
  };

  const examRepository: ExamRepository = {
    async find(id) {
      examFindCalls += 1;
      return storedBanks.get(id);
    },
    async create(bank) {
      const record = { id: "new-bank-1", bank };
      storedBanks.set(record.id, record);
      return record;
    },
  };

  const cacheStore = createInMemoryCacheStore();
  const app = buildApp({
    logger: false,
    jwtSecret: "synthetic-only-secret-with-32-characters",
    userLookup,
    cacheStore,
    examRepository,
    curriculumRepository: emptyCurriculum,
  });
  t.after(() => app.close());
  await app.ready();

  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: userId })}` };

  const first = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });
  const second = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });
  const third = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 200);
  assert.equal(userLookupCalls, 1);
  assert.equal(examFindCalls, 1);

  const created = await app.inject({
    method: "POST",
    url: "/api/exam/banks",
    headers,
    payload: sampleBank,
  });
  assert.equal(created.statusCode, 201);
  const fetchedCreated = await app.inject({
    method: "GET",
    url: "/api/exam/banks/new-bank-1",
    headers,
  });
  assert.equal(fetchedCreated.statusCode, 200);
  assert.equal(examFindCalls, 1);
});

test("Learning service fails open when CacheStore throws", async (t) => {
  let userLookupCalls = 0;
  let examFindCalls = 0;

  const brokenCache: CacheStore = {
    async get() { throw new Error("Redis timeout"); },
    async set() { throw new Error("Redis write failed"); },
    async del() { throw new Error("Redis del failed"); },
    async setIfAbsent() { throw new Error("Redis setIfAbsent failed"); },
  };

  const app = buildApp({
    logger: false,
    jwtSecret: "synthetic-only-secret-with-32-characters",
    userLookup: {
      async findById(id) {
        userLookupCalls += 1;
        return { id, email: "learner@example.com", role: "member", approvalStatus: "approved" };
      },
    },
    cacheStore: brokenCache,
    examRepository: {
      async find(id) {
        examFindCalls += 1;
        return id === "aws-sap" ? { id, bank: sampleBank } : undefined;
      },
      async create() { throw new Error("unused"); },
    },
    curriculumRepository: emptyCurriculum,
  });
  t.after(() => app.close());
  await app.ready();

  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: userId })}` };
  const res1 = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });
  const res2 = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers });

  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);
  assert.equal(userLookupCalls, 2);
  assert.equal(examFindCalls, 2);
});
