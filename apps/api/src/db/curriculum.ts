import { CurriculumBundleSchema, type CurriculumBundle } from "@innova/contracts";
import type { BatchItem } from "drizzle-orm/batch";
import { eq } from "drizzle-orm";
import type { createDatabase } from "./client.js";
import {
  curriculumSubjects, curriculumSourceDocuments, curriculumChapters, curriculumSections,
  curriculumSourceBlocks, curriculumKnowledgePoints, curriculumQuestions,
  curriculumKnowledgePointSources, curriculumQuestionSources, curriculumQuestionKnowledgePoints,
} from "./schema.js";

export interface CurriculumImportResult {
  subjectId: string;
  policy: "replace-subject";
  counts: Record<"sourceDocuments" | "chapters" | "sections" | "sourceBlocks" | "knowledgePoints" | "questions", number>;
}

export interface CurriculumRepository {
  /** Complete Subject snapshot; omitted children are deleted within this Subject.
   * expectedSubjectId is supplied independently by the pipeline, preventing a
   * mislabeled bundle from replacing another Subject. Never pass a partial chapter.
   */
  importBundle(input: unknown, options: { expectedSubjectId: string }): Promise<CurriculumImportResult>;
}

// Keep each statement below PostgreSQL's bind-parameter limit while preserving
// a single transaction for the entire Subject (including large textbooks).
function chunks<T>(rows: T[]): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += 200) batches.push(rows.slice(offset, offset + 200));
  return batches;
}

// Resolve arbitrary bundle array order to parent-before-child insert order.
function sectionLevels(sections: CurriculumBundle["sections"]): CurriculumBundle["sections"][] {
  const levels: CurriculumBundle["sections"][] = [];
  const inserted = new Set<string>();
  let remaining = sections;
  while (remaining.length) {
    const level = remaining.filter((s) => s.parentSectionId === null || inserted.has(s.parentSectionId));
    if (!level.length) throw new Error("Invalid section hierarchy");
    levels.push(level);
    for (const section of level) inserted.add(section.id);
    remaining = remaining.filter((s) => !inserted.has(s.id));
  }
  return levels;
}

export function createCurriculumRepository(db: ReturnType<typeof createDatabase>): CurriculumRepository {
  return {
    async importBundle(input, { expectedSubjectId }) {
      // Parse unknown even for typed callers; constructing query builders sends
      // no SQL. Validation, hierarchy sorting and plan creation precede batch.
      const bundle = CurriculumBundleSchema.parse(input);
      const subjectId = bundle.subject.id;
      if (subjectId !== expectedSubjectId) throw new Error("Curriculum import target mismatch");
      const levels = sectionLevels(bundle.sections);
      const queries: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
        // Upsert acquires the Subject row lock until transaction commit, serializing
        // concurrent replacements of the same Subject. Different Subjects coexist.
        db.insert(curriculumSubjects).values({ id: subjectId, content: bundle.subject })
          .onConflictDoUpdate({ target: curriculumSubjects.id, set: { content: bundle.subject } }),
        db.delete(curriculumChapters).where(eq(curriculumChapters.subjectId, subjectId)),
        db.delete(curriculumSourceDocuments).where(eq(curriculumSourceDocuments.subjectId, subjectId)),
      ];
      for (const rows of chunks(bundle.sourceDocuments)) queries.push(db.insert(curriculumSourceDocuments).values(rows.map((content) => ({ subjectId, id: content.id, content }))));
      for (const rows of chunks(bundle.chapters)) queries.push(db.insert(curriculumChapters).values(rows.map((content) => ({ subjectId, id: content.id, position: content.position, content }))));
      for (const level of levels) for (const rows of chunks(level)) queries.push(db.insert(curriculumSections).values(rows.map((content) => ({
        subjectId, id: content.id, chapterId: content.chapterId, parentSectionId: content.parentSectionId, position: content.position, content,
      }))));
      for (const rows of chunks(bundle.sourceBlocks)) queries.push(db.insert(curriculumSourceBlocks).values(rows.map((content) => ({
        subjectId, id: content.id, sectionId: content.sectionId, sourceDocumentId: content.sourceDocumentId, position: content.position, revision: content.revision, content,
      }))));
      if (bundle.knowledgePoints.length) {
        for (const rows of chunks(bundle.knowledgePoints)) queries.push(db.insert(curriculumKnowledgePoints).values(rows.map((content) => ({ subjectId, id: content.id, sectionId: content.sectionId, content }))));
        const sourceLinks = bundle.knowledgePoints.flatMap((k) => k.sourceBlockIds.map((sourceBlockId) => ({ subjectId, knowledgePointId: k.id, sourceBlockId })));
        for (const rows of chunks(sourceLinks)) queries.push(db.insert(curriculumKnowledgePointSources).values(rows));
      }
      if (bundle.questions.length) {
        for (const rows of chunks(bundle.questions)) queries.push(db.insert(curriculumQuestions).values(rows.map((content) => ({
          subjectId, id: content.id, chapterId: content.chapterId, sectionId: content.sectionId, position: content.position,
          sourceBlockId: content.transformation.sourceBlockId, sourceRevision: content.transformation.sourceRevision, content,
        }))));
        const sourceLinks = bundle.questions.flatMap((q) => q.sourceBlockIds.map((sourceBlockId) => ({ subjectId, questionId: q.id, sourceBlockId })));
        for (const rows of chunks(sourceLinks)) queries.push(db.insert(curriculumQuestionSources).values(rows));
        const knowledgeLinks = bundle.questions.flatMap((q) => q.knowledgePointIds.map((knowledgePointId) => ({ subjectId, questionId: q.id, knowledgePointId })));
        for (const rows of chunks(knowledgeLinks)) queries.push(db.insert(curriculumQuestionKnowledgePoints).values(rows));
      }
      // Neon HTTP batch is one server-side transaction. Individual .execute()
      // calls and neon-http's unsupported interactive transaction are not used.
      await db.batch(queries);
      return {
        subjectId, policy: "replace-subject",
        counts: {
          sourceDocuments: bundle.sourceDocuments.length, chapters: bundle.chapters.length,
          sections: bundle.sections.length, sourceBlocks: bundle.sourceBlocks.length,
          knowledgePoints: bundle.knowledgePoints.length, questions: bundle.questions.length,
        },
      };
    },
  };
}
