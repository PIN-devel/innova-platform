import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import { buildApp } from "../src/app.js";
import { CurriculumReadingOrderError, type CurriculumReadRepository } from "../src/db/curriculum-read.js";
import type { UserLookup } from "../src/db/users.js";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";
import { createGcsCurriculumAssetReader } from "../src/curriculum-assets.js";
import { createApplicationLogger } from "../src/logger.js";

const b = createSyntheticCurriculum();
const chapter = { ...b.chapters.find((c) => c.id === "chapter-1")!, readingOrder: b.sourceBlocks.map((s) => s.id) };
const detail = { subject: b.subject, chapter, sections: b.sections.filter((s) => s.chapterId === chapter.id), sourceBlocks: b.sourceBlocks, knowledgePoints: b.knowledgePoints };
const base = `/api/curriculum/subjects/${b.subject.id}/chapters/${chapter.id}`;
const userId = "00000000-0000-4000-8000-000000000001";
const repository: CurriculumReadRepository = {
  async subjects() { return [b.subject]; }, async subject(id) { return id === b.subject.id ? b.subject : undefined; },
  async chapters(id) { return id === b.subject.id ? [chapter] : []; },
  async chapter(subject, id) { return subject === b.subject.id && id === chapter.id ? detail : undefined; },
  async questions(subject, id) { return subject === b.subject.id && id === chapter.id ? b.questions : []; },
};

test("Curriculum API approval, scope, no-store, answer concealment and exact grading", async (t) => {
  let approvalStatus: "approved" | "pending" | "rejected" = "approved";
  const users: UserLookup = {
    async findById(id) {
      return id === userId ? { id, email: "synthetic@example.com", role: "member", approvalStatus, createdAt: "", updatedAt: "" } : undefined;
    },
  };
  let assetReads = 0;
  const app = buildApp({
    logger: false,
    jwtSecret: "synthetic-only-secret-with-32-characters",
    userLookup: users,
    examRepository: { async find() { return undefined; }, async create() { throw new Error("unused"); } },
    curriculumRepository: repository,
    curriculumAssets: async () => { assetReads++; return { bytes: Buffer.from("synthetic-image"), contentType: "image/png" }; },
  });
  t.after(() => app.close()); await app.ready();
  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: userId })}` };
  for (const status of [null, "pending", "rejected"] as const) {
    if (status) approvalStatus = status;
    for (const path of ["/api/curriculum/subjects", base, `${base}/quiz`, `${base}/blocks/block-body/assets/2`]) {
      const response = await app.inject({ method: "GET", url: path, headers: status ? headers : {} });
      assert.equal(response.statusCode, status ? 403 : 401);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.headers.vary, "Cookie");
    }
    assert.equal((await app.inject({ method: "POST", url: `${base}/questions/question-short/grade`, headers: status ? headers : {}, payload: { kind: "short-answer", text: "sample" } })).statusCode, status ? 403 : 401);
  }
  assert.equal(assetReads, 0); approvalStatus = "approved";
  for (const path of ["/api/curriculum/subjects", `/api/curriculum/subjects/${b.subject.id}`, `/api/curriculum/subjects/${b.subject.id}/chapters`, base]) assert.equal((await app.inject({ url: path, headers })).statusCode, 200);
  const quiz = await app.inject({ url: `${base}/quiz`, headers });
  assert.equal(quiz.statusCode, 200);
  assert.equal(quiz.json().questions.length, 5);
  for (const question of quiz.json().questions) assert.equal("answer" in question, false);
  assert.equal(quiz.json().questions.find((q: { id: string }) => q.id === "question-short").matching, "exact");
  for (const [answer, correct] of [["sample", true], ["Sample", false], [" sample", false], ["sample ", false], ["samples", false]]) {
    const response = await app.inject({ method: "POST", url: `${base}/questions/question-short/grade`, headers, payload: { kind: "short-answer", text: answer } });
    assert.equal(response.statusCode, 200); assert.equal(response.json().correct, correct);
    assert.deepEqual(response.json().answer.sourceBlockIds, ["block-answer"]);
  }
  for (const [id, input, correct] of [
    ["question-single", { kind: "single-choice", choiceIds: ["a"] }, true],
    ["question-single", { kind: "single-choice", choiceIds: ["b"] }, false],
    ["question-multiple", { kind: "multiple-choice", choiceIds: ["b", "a"] }, true],
    ["question-multiple", { kind: "multiple-choice", choiceIds: ["a"] }, false],
  ]) {
    const response = await app.inject({ method: "POST", url: `${base}/questions/${id}/grade`, headers, payload: input });
    assert.equal(response.statusCode, 200); assert.equal(response.json().correct, correct);
  }
  const assetResponse = await app.inject({ url: `${base}/blocks/block-body/assets/2`, headers });
  assert.equal(assetResponse.statusCode, 200); assert.equal(assetResponse.headers["content-type"], "image/png");
  assert.equal(assetResponse.headers["x-content-type-options"], "nosniff");
  assert.equal(assetResponse.body, "synthetic-image"); assert.equal(assetReads, 1);
  assert.equal((await app.inject({ url: `${base}/blocks/block-body/assets/99`, headers })).statusCode, 404);
  assert.equal((await app.inject({ url: `${base}/blocks/block-body/assets/0`, headers })).statusCode, 404);
});

test("Curriculum API reading order corruption returns 409 and logs no private contents", async (t) => {
  const users: UserLookup = {
    async findById(id) {
      return id === userId ? { id, email: "synthetic@example.com", role: "member", approvalStatus: "approved", createdAt: "", updatedAt: "" } : undefined;
    },
  };
  const logs: string[] = [];
  const destination = new Writable({ write(chunk, _encoding, callback) { logs.push(chunk.toString()); callback(); } });
  const app = buildApp({
    logger: createApplicationLogger({ destination }), jwtSecret: "synthetic-only-secret-with-32-characters",
    userLookup: users, examRepository: { async find() { return undefined; }, async create() { throw new Error("unused"); } },
    curriculumRepository: {
      ...repository,
      async chapter() { throw new CurriculumReadingOrderError("Corrupted synthetic reading order"); },
      async questions() { throw new CurriculumReadingOrderError("Corrupted quiz reading order"); },
    },
    curriculumAssets: createGcsCurriculumAssetReader({ bucket: "synthetic-curriculum-assets" }),
  });
  t.after(() => app.close()); await app.ready();
  const headers = { cookie: `innova_auth=${app.jwt.sign({ sub: userId })}` };
  for (const url of [base, `${base}/quiz`]) {
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "BUSINESS_RULE_VIOLATION");
    assert.ok(response.json().error.message.includes("reading order"));
  }
  assert.equal(logs.some((l) => l.includes("Invented")), false);
});
