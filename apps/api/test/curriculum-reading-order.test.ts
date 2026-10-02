import assert from "node:assert/strict";
import { test } from "node:test";
import { CurriculumBundleSchema, CurriculumChapterResponseSchema } from "@innova/contracts";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";

function orderedBundle() {
  const bundle = createSyntheticCurriculum();
  bundle.sourceBlocks.push({ ...bundle.sourceBlocks[0], id: "parent-continuation", position: 1 });
  bundle.chapters.find((c) => c.id === "chapter-1")!.readingOrder = ["block-body", "block-quiz", "parent-continuation", "block-answer"];
  return bundle;
}
test("explicit reading order preserves interleaved parent and child despite equal local positions and shuffled arrays", () => {
  const b = orderedBundle(); b.sourceBlocks.reverse(); b.sections.reverse();
  assert.equal(CurriculumBundleSchema.safeParse(b).success, true);
  const chapter = b.chapters.find((c) => c.id === "chapter-1")!;
  const detail = { subject: b.subject, chapter, sections: b.sections.filter((s) => s.chapterId === chapter.id), knowledgePoints: b.knowledgePoints, sourceBlocks: chapter.readingOrder!.map((id) => b.sourceBlocks.find((s) => s.id === id)) };
  assert.equal(CurriculumChapterResponseSchema.safeParse(detail).success, true);
  assert.equal(CurriculumChapterResponseSchema.safeParse({ ...detail, sourceBlocks: [...detail.sourceBlocks].reverse() }).success, false);
  assert.equal(CurriculumChapterResponseSchema.safeParse({ ...detail, chapter: { ...chapter, readingOrder: undefined } }).success, false);
});
test("reading order rejects omissions, duplicates, unknown/cross-Chapter blocks and contradictory local order", () => {
  for (const order of [
    ["block-body", "block-quiz", "block-answer"],
    ["block-body", "block-quiz", "parent-continuation", "block-answer", "block-answer"],
    ["block-body", "block-quiz", "parent-continuation", "unknown-block"],
    ["parent-continuation", "block-quiz", "block-body", "block-answer"],
  ]) {
    const b = orderedBundle(); b.chapters.find((c) => c.id === "chapter-1")!.readingOrder = order;
    assert.equal(CurriculumBundleSchema.safeParse(b).success, false);
  }
  const b = orderedBundle(); b.chapters.find((c) => c.id === "chapter-2")!.readingOrder = ["block-body"];
  assert.equal(CurriculumBundleSchema.safeParse(b).success, false);
  // Existing authoring data remains valid, but cannot be served as a reading Chapter.
  assert.equal(CurriculumBundleSchema.safeParse(createSyntheticCurriculum()).success, true);
});
