import assert from "node:assert/strict";
import { test } from "node:test";
import { CurriculumBundleSchema, type CurriculumBundle } from "@innova/contracts";
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

test("derived is an explicit future origin, and chapter-level quiz can omit Section", () => {
  const bundle = createSyntheticCurriculum();
  bundle.questions[0].origin = "textbook-derived";
  bundle.questions[0].sectionId = null;
  assert.equal(CurriculumBundleSchema.safeParse(bundle).success, true);
});

test("root section IDs do not collide with the null parent ordering scope", () => {
  const bundle = createSyntheticCurriculum();
  bundle.sections.push({ ...bundle.sections[2], id: "root", position: 1 });
  bundle.sections.push({ ...bundle.sections[0], id: "root-child", parentSectionId: "root" });
  assert.equal(CurriculumBundleSchema.safeParse(bundle).success, true);
});
