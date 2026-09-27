import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import type { ExamRepository } from "../src/db/exam.js";
import type { UserRepository } from "../src/db/users.js";
import { ExamBankSchema } from "@innova/contracts";
const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const userId = "f5f8301d-996b-461b-95c9-9a72162023d6";
const users: UserRepository = {
  async findById(id) { return id === userId ? { id, email: "exam@example.com", passwordHash: "unused" } : undefined; },
  async findByEmail() { return undefined; },
  async create() { return undefined; },
};
const sampleBank = ExamBankSchema.parse({
  schema: "sap-drill-bank.v1", subject: "Synthetic test", source: "test", generatedAt: "2026-01-01",
  concepts: [{ id: "concept-1", chapter: 1, deck: "test", term: "Placeholder", definition: "Synthetic definition", rationale: "Synthetic explanation" }],
  scenarios: [{ id: "scenario-1", chapter: 1, stem: "Synthetic prompt", choices: ["A", "B", "C"], answerIndex: 0, rationale: "Synthetic explanation" }],
});
function createExamTestRepository(): ExamRepository {
  const banks = new Map([["aws-sap", sampleBank]]);
  return {
    async find(id) { const bank = banks.get(id); return bank ? { id, bank } : undefined; },
    async create(bank) { const id = `bank-${banks.size}`; banks.set(id, bank); return { id, bank }; },
  };
}

test("health routes", async (t) => {
  const app = buildApp({ logger: false, examRepository: createExamTestRepository(), userRepository: users, jwtSecret });
  t.after(() => app.close());

  const root = await app.inject({ method: "GET", url: "/" });
  assert.equal(root.statusCode, 200);
  assert.deepEqual(root.json(), { hello: "world" });

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.deepEqual(health.json(), { status: "ok" });
});

test("exam bank API requires JWT cookie and preserves validated records", async (t) => {
  const app = buildApp({ logger: false, examRepository: createExamTestRepository(), userRepository: users, jwtSecret });
  t.after(() => app.close());
  await app.ready();
  const cookie = `exam_drill_auth=${app.jwt.sign({ sub: userId }, { expiresIn: "15m" })}`;
  const authenticated = { cookie };
  const unauthorized = await app.inject({ method: "GET", url: "/api/exam/banks/default" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.json().error.code, "UNAUTHORIZED");
  assert.equal(unauthorized.headers["cache-control"], "no-store");
  const wrongToken = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: { authorization: "Bearer wrong" } });
  assert.equal(wrongToken.statusCode, 401);
  const deniedWrite = await app.inject({ method: "POST", url: "/api/exam/banks", payload: sampleBank });
  assert.equal(deniedWrite.statusCode, 401);
  const defaultResponse = await app.inject({ method: "GET", url: "/api/exam/banks/default", headers: authenticated });
  assert.equal(defaultResponse.statusCode, 200);
  assert.equal(defaultResponse.headers["cache-control"], "no-store");
  assert.equal(defaultResponse.json().bank.concepts.length, 1);
  assert.equal(defaultResponse.json().bank.scenarios.length, 1);
  assert.deepEqual(defaultResponse.json().bank.concepts.find((note: { id: string }) => note.id === sampleBank.concepts[0]?.id), sampleBank.concepts[0]);

  const created = await app.inject({ method: "POST", url: "/api/exam/banks", headers: authenticated, payload: sampleBank });
  assert.equal(created.statusCode, 201);
  const id = created.json().id as string;
  const stored = await app.inject({ method: "GET", url: `/api/exam/banks/${id}`, headers: authenticated });
  assert.deepEqual(stored.json().bank, created.json().bank);
  const duplicate = await app.inject({ method: "POST", url: "/api/exam/banks", headers: authenticated, payload: { ...sampleBank, concepts: [sampleBank.concepts[0], sampleBank.concepts[0]] } });
  assert.equal(duplicate.statusCode, 400);
  assert.equal(duplicate.json().error.code, "INVALID_INPUT");
  assert.ok(duplicate.json().error.details.some((detail: { reason: string }) => detail.reason === "invalid_value"));
  assert.equal("issues" in duplicate.json(), false);
  const missingBank = await app.inject({ method: "GET", url: "/api/exam/banks/missing", headers: authenticated });
  assert.equal(missingBank.statusCode, 404);
  assert.deepEqual(missingBank.json(), { error: { code: "NOT_FOUND", message: "Exam bank not found" } });
});

test("server fails closed without a configured JWT secret", () => {
  assert.throws(() => buildApp({ logger: false, examRepository: createExamTestRepository(), userRepository: users, jwtSecret: "" }), /JWT_SECRET/);
});
