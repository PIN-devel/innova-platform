import assert from "node:assert/strict";
import { test } from "node:test";
import { CurriculumBundleSchema, CurriculumQuestionSchema, type CurriculumBundle } from "@innova/contracts";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";

test("bundle preserves hierarchy, rich content, provenance and all answer states", () => {
  for (const subjectId of ["synthetic-architecture", "synthetic-design"]) {
    const bundle = createSyntheticCurriculum(subjectId);
    assert.deepEqual(CurriculumBundleSchema.parse(bundle), bundle);
  }
});

const invalid: [string, (bundle: CurriculumBundle) => void][] = [
  ["cross-subject chapter", (b) => { b.chapters[0].subjectId = "another-subject"; }],
  ["cross-subject source", (b) => { b.sourceDocuments[0].subjectId = "another-subject"; }],
  ["cross-subject block", (b) => { b.sourceBlocks[0].subjectId = "another-subject"; }],
  ["cross-subject section", (b) => { b.sections[0].subjectId = "another-subject"; }],
  ["cross-subject knowledge", (b) => { b.knowledgePoints[0].subjectId = "another-subject"; }],
  ["cross-subject question", (b) => { b.questions[0].subjectId = "another-subject"; }],
  ["subject code drift", (b) => { b.subject.code = "changed-code"; }],
  ["unstable/invalid ID", (b) => { b.chapters[0].id = "Chapter 1"; }],
  ["duplicate ID", (b) => { b.chapters.push(b.chapters[0]); }],
  ["duplicate ID across kinds", (b) => { b.knowledgePoints[0].id = b.sourceBlocks[0].id; }],
  ["unknown chapter", (b) => { b.sections[0].chapterId = "missing"; }],
  ["unknown parent", (b) => { b.sections[0].parentSectionId = "missing"; }],
  ["parent in another chapter", (b) => { b.sections[0].parentSectionId = "section-other"; }],
  ["self parent", (b) => { b.sections[0].parentSectionId = b.sections[0].id; }],
  ["section cycle", (b) => { b.sections[2].parentSectionId = "section-child"; }],
  ["duplicate chapter order", (b) => { b.chapters[0].position = 0; }],
  ["duplicate root order", (b) => { b.sections.push({ ...b.sections[2], id: "section-another" }); }],
  ["duplicate child order", (b) => { b.sections.push({ ...b.sections[0], id: "section-another" }); }],
  ["negative order", (b) => { b.sections[0].position = -1; }],
  ["unknown block section", (b) => { b.sourceBlocks[0].sectionId = "missing"; }],
  ["unknown document", (b) => { b.sourceBlocks[0].sourceDocumentId = "missing"; }],
  ["reversed pages", (b) => { b.sourceBlocks[0].location.pdfPageEnd = 0; }],
  ["page beyond document", (b) => { b.sourceBlocks[0].location.pdfPageEnd = 11; }],
  ["duplicate block order", (b) => { b.sourceBlocks[2].position = 0; }],
  ["missing knowledge evidence", (b) => { b.knowledgePoints[0].sourceBlockIds = []; }],
  ["orphan knowledge evidence", (b) => { b.knowledgePoints[0].sourceBlockIds = ["missing"]; }],
  ["duplicate knowledge evidence", (b) => { b.knowledgePoints[0].sourceBlockIds = ["block-body", "block-body"]; }],
  ["orphan knowledge section", (b) => { b.knowledgePoints[0].sectionId = "missing"; }],
  ["missing question evidence", (b) => { b.questions[0].sourceBlockIds = []; }],
  ["orphan question evidence", (b) => { b.questions[0].sourceBlockIds = ["missing"]; }],
  ["orphan question knowledge", (b) => { b.questions[0].knowledgePointIds = ["missing"]; }],
  ["question knowledge point in another chapter", (b) => { b.knowledgePoints[0].sectionId = "section-other"; }],
  ["orphan question chapter", (b) => { b.questions[0].chapterId = "missing"; }],
  ["question section/chapter mismatch", (b) => { b.questions[0].sectionId = "section-other"; }],
  ["question source/section mismatch", (b) => { b.questions[0].sectionId = "section-root"; }],
  ["question source/chapter mismatch", (b) => { b.questions[0].chapterId = "chapter-2"; b.questions[0].sectionId = null; }],
  ["missing canonical source", (b) => { b.questions[0].transformation.sourceBlockId = "missing"; }],
  ["canonical source absent from evidence", (b) => { b.questions[0].sourceBlockIds = ["block-answer"]; }],
  ["non-quiz canonical source", (b) => { b.questions[0].transformation.sourceBlockId = "block-answer"; }],
  ["stale quiz source revision", (b) => { b.sourceBlocks[1].revision = "revision-2"; }],
  ["duplicate question order", (b) => { b.questions[1].position = 0; }],
  ["official answer without evidence", (b) => { const q = b.questions[0]; if (q.answer.status !== "unresolved") q.answer.sourceBlockIds = []; }],
  ["orphan answer evidence", (b) => { const q = b.questions[0]; if (q.answer.status !== "unresolved") q.answer.sourceBlockIds = ["missing"]; }],
  ["answer evidence absent from question", (b) => { const q = b.questions[0]; if (q.answer.status !== "unresolved") q.answer.sourceBlockIds = ["block-body"]; }],
  ["invalid choice answer", (b) => { const q = b.questions[0]; if ("correctChoiceIds" in q.answer) q.answer.correctChoiceIds = ["c"]; }],
  ["multiple answers for single choice", (b) => { const q = b.questions[0]; if ("correctChoiceIds" in q.answer) q.answer.correctChoiceIds = ["a", "b"]; }],
  ["duplicate choice", (b) => { const q = b.questions[0]; if ("choices" in q) q.choices[1].id = "a"; }],
  ["public asset URL", (b) => { b.sourceDocuments[0].assetKey = "https://example.com/private.pdf"; }],
  ["asset traversal", (b) => { b.sourceDocuments[0].assetKey = "private/../source.pdf"; }],
];
for (const [name, mutate] of invalid) test(`rejects ${name}`, () => {
  const bundle = createSyntheticCurriculum();
  mutate(bundle);
  assert.equal(CurriculumBundleSchema.safeParse(bundle).success, false, name);
});

test("unknown payload fields are rejected instead of silently losing extracted data", () => {
  const bundle = createSyntheticCurriculum();
  assert.equal(CurriculumBundleSchema.safeParse({ ...bundle, unsupportedMetadata: true }).success, false);
  assert.equal(CurriculumBundleSchema.safeParse({ ...bundle, questions: [{ ...bundle.questions[0], answer: { status: "unresolved", reason: "unknown", correctChoiceIds: ["a"] } }] }).success, false);
});

test("chapter-level quiz can reference knowledge points across Sections in its Chapter", () => {
  const bundle = createSyntheticCurriculum();
  bundle.knowledgePoints.push({ ...bundle.knowledgePoints[0], id: "knowledge-child", sectionId: "section-child" });
  bundle.questions[0].sectionId = null;
  bundle.questions[0].knowledgePointIds.push("knowledge-child");
  assert.equal(CurriculumBundleSchema.safeParse(bundle).success, true);
});

test("chapter-level quiz rejects a knowledge point from another Chapter", () => {
  const bundle = createSyntheticCurriculum();
  bundle.questions[0].sectionId = null;
  bundle.knowledgePoints[0].sectionId = "section-other";
  const result = CurriculumBundleSchema.safeParse(bundle);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some((issue) => issue.message === "Question knowledge point/chapter mismatch" && issue.path.join(".") === "questions.0.knowledgePointIds.0"));
});

test("all official and proposed answer kinds require evidence before bundle relation validation", () => {
  const bundle = createSyntheticCurriculum();
  for (const question of bundle.questions) {
    if (question.answer.status === "unresolved") continue;
    for (const status of ["official", "proposed"] as const) {
      const withoutEvidence: unknown = { ...question, answer: { ...question.answer, status, sourceBlockIds: [] } };
      assert.equal(CurriculumQuestionSchema.safeParse(withoutEvidence).success, false, `${status} ${question.kind}`);
      assert.equal(CurriculumBundleSchema.safeParse({ ...bundle, questions: [withoutEvidence] }).success, false, `${status} ${question.kind}`);
    }
  }
});

test("proposed evidence must exist and be included among the question sources", () => {
  const bundle = createSyntheticCurriculum();
  const question = bundle.questions[1];
  assert.notEqual(question.answer.status, "unresolved");
  if (question.answer.status === "unresolved") return;
  for (const sourceBlockId of ["missing", "block-body"]) {
    question.answer.sourceBlockIds = [sourceBlockId];
    assert.equal(CurriculumBundleSchema.safeParse(bundle).success, false);
  }
});

test("actual textbook bundles reject derived questions while the standalone origin type remains", () => {
  for (const subjectId of ["it-architecture", "software-design-principles", "synthetic-design"]) {
    const bundle = createSyntheticCurriculum(subjectId);
    bundle.questions[0].origin = "textbook-derived";
    assert.equal(CurriculumQuestionSchema.safeParse(bundle.questions[0]).success, true);
    const result = CurriculumBundleSchema.safeParse(bundle);
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "questions.0.origin"));
  }
});

test("financial roles are preserved alongside generic case-study without changing content", () => {
  for (const role of ["financial-context", "financial-case", "case-study"] as const) {
    const bundle = createSyntheticCurriculum();
    bundle.sourceBlocks[0].role = role;
    assert.deepEqual(CurriculumBundleSchema.parse(bundle), bundle);
  }
});

test("root section IDs do not collide with the null parent ordering scope", () => {
  const bundle = createSyntheticCurriculum();
  bundle.sections.push({ ...bundle.sections[2], id: "root", position: 1 });
  bundle.sections.push({ ...bundle.sections[0], id: "root-child", parentSectionId: "root" });
  assert.equal(CurriculumBundleSchema.safeParse(bundle).success, true);
});
