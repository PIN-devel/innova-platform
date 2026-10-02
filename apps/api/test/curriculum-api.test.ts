import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import { buildApp } from "../src/app.js";
import { CurriculumReadingOrderError, type CurriculumReadRepository } from "../src/db/curriculum-read.js";
import type { UserRepository } from "../src/db/users.js";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";
import { createBlobCurriculumAssetReader } from "../src/curriculum-assets.js";
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
  const users: UserRepository = {
    async findById(id) { return id === userId ? { id, email: "synthetic@example.com", passwordHash: "unused", role: "member", approvalStatus } : undefined; },
    async findByEmail() {}, async create() {}, async findPending() { return []; }, async approvePending() {}, async rejectPending() {},
  };
  let assetReads = 0;
  const app = buildApp({ logger: false, jwtSecret: "synthetic-only-secret-with-32-characters", userRepository: users, examRepository: { async find() {}, async create() { throw new Error("unused"); } }, curriculumRepository: repository,
    curriculumAssets: async () => { assetReads++; return { bytes: Buffer.from("synthetic-image"), contentType: "image/png" }; },
  });
  t.after(() => app.close()); await app.ready();
  const headers = { cookie: `exam_drill_auth=${app.jwt.sign({ sub: userId })}` };
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
    ["question-self", { kind: "self-assessment" }, null],
    ["question-unresolved", { kind: "short-answer", text: "sample" }, null],
  ] as const) {
    const response = await app.inject({ method: "POST", url: `${base}/questions/${id}/grade`, headers, payload: input });
    assert.equal(response.statusCode, 200); assert.equal(response.json().correct, correct);
  }
  for (const input of [{ kind: "short-answer", text: "sample" }, { kind: "single-choice", choiceIds: ["a", "a"] }, { kind: "single-choice", choiceIds: ["a", "b"] }, { kind: "single-choice", choiceIds: ["unknown"] }]) assert.equal((await app.inject({ method: "POST", url: `${base}/questions/question-single/grade`, headers, payload: input })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: `${base}/questions/missing/grade`, headers, payload: { kind: "short-answer", text: "sample" } })).statusCode, 404);
  assert.equal((await app.inject({ url: base.replace(chapter.id, "chapter-2"), headers })).statusCode, 404);
  const asset = await app.inject({ url: `${base}/blocks/block-body/assets/2`, headers });
  assert.equal(asset.statusCode, 200); assert.equal(asset.headers["content-type"], "image/png");
  assert.equal(assetReads, 1);
  assert.equal((await app.inject({ url: `${base}/blocks/block-body/assets/0`, headers })).statusCode, 404);
  assert.equal((await app.inject({ url: `${base}/blocks/block-body/assets/-1`, headers })).statusCode, 400);
});

test("Chapter without normalized reading order is blocked instead of guessed", async (t) => {
  const app = buildApp({ logger: false, jwtSecret: "synthetic-only-secret-with-32-characters", examRepository: { async find() {}, async create() { throw new Error("unused"); } }, userRepository: { async findById() { return { id: userId, email: "test@example.com", passwordHash: "unused", role: "member", approvalStatus: "approved" }; }, async findByEmail() {}, async create() {}, async findPending() { return []; }, async approvePending() {}, async rejectPending() {} }, curriculumRepository: { ...repository, async chapter() { throw new CurriculumReadingOrderError("Chapter requires explicit reading order"); } } });
  t.after(() => app.close()); await app.ready();
  const response = await app.inject({ url: base, headers: { cookie: `exam_drill_auth=${app.jwt.sign({ sub: userId })}` } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, "BUSINESS_RULE_VIOLATION");
});

test("Blob SDK failures expose no credential or URL in Curriculum responses or logs", async (t) => {
  const lines: string[] = [];
  const logger = createApplicationLogger({ level: "info", destination: new Writable({ write(chunk, _encoding, callback) { lines.push(String(chunk)); callback(); } }) });
  const marker = "synthetic-blob-credential-marker";
  const urlMarker = "https://synthetic.private.blob.vercel-storage.com/private-marker.png";
  let reads = 0;
  let missing = false;
  const users: UserRepository = {
    async findById() { return { id: userId, email: "test@example.com", passwordHash: "unused", role: "member", approvalStatus: "approved" }; },
    async findByEmail() {}, async create() {}, async findPending() { return []; }, async approvePending() {}, async rejectPending() {},
  };
  const app = buildApp({ logger, jwtSecret: "synthetic-only-secret-with-32-characters", userRepository: users,
    examRepository: { async find() {}, async create() { throw new Error("unused"); } },
    curriculumRepository: { ...repository, async chapter(subjectId, chapterId) {
      const result = await repository.chapter(subjectId, chapterId);
      if (!result) return undefined;
      const copy = structuredClone(result);
      const image = copy.sourceBlocks.find((block) => block.id === "block-body")!.content[2];
      assert.equal(image.type, "diagram");
      if (image.type === "diagram") image.assetKey = "synthetic/diagram.png";
      return copy;
    } },
    curriculumAssets: createBlobCurriculumAssetReader(marker, async () => { reads++; if (missing) return null; throw new Error(`${marker} ${urlMarker}`); }),
  });
  t.after(async () => { await app.close(); logger.flush(); });
  await app.ready();
  const url = `${base}/blocks/block-body/assets/2`;
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal(reads, 0);
  const headers = { cookie: `exam_drill_auth=${app.jwt.sign({ sub: userId })}` };
  const response = await app.inject({ url, headers });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: { code: "INTERNAL_ERROR", message: "Private asset storage is unavailable" } });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.vary, "Cookie");
  missing = true;
  assert.equal((await app.inject({ url, headers })).statusCode, 404);
  logger.flush();
  for (const value of [response.body, lines.join("")]) {
    assert.equal(value.includes(marker), false);
    assert.equal(value.includes(urlMarker), false);
  }
});
