import { and, eq, asc } from "drizzle-orm";
import {
  CurriculumSubjectSchema, CurriculumChapterSchema, CurriculumChapterResponseSchema, CurriculumQuestionSchema,
  type CurriculumSubject, type CurriculumChapter, type CurriculumChapterResponse, type CurriculumQuestion,
} from "@innova/contracts";
import type { createDatabase } from "./client.js";
import { curriculumSubjects, curriculumChapters, curriculumSections, curriculumSourceBlocks, curriculumKnowledgePoints, curriculumQuestions } from "./schema.js";

export interface CurriculumReadRepository {
  subjects(): Promise<CurriculumSubject[]>;
  subject(id: string): Promise<CurriculumSubject | undefined>;
  chapters(subjectId: string): Promise<CurriculumChapter[]>;
  chapter(subjectId: string, chapterId: string): Promise<CurriculumChapterResponse | undefined>;
  questions(subjectId: string, chapterId: string): Promise<CurriculumQuestion[]>;
}

export class CurriculumReadingOrderError extends Error {}

export function createCurriculumReadRepository(db: ReturnType<typeof createDatabase>): CurriculumReadRepository {
  const subject = async (id: string) => {
    const [row] = await db.select().from(curriculumSubjects).where(eq(curriculumSubjects.id, id));
    return row ? CurriculumSubjectSchema.parse(row.content) : undefined;
  };
  return {
    async subjects() {
      return (await db.select().from(curriculumSubjects)).map((r) => CurriculumSubjectSchema.parse(r.content)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    },
    subject,
    async chapters(subjectId) {
      return (await db.select().from(curriculumChapters).where(eq(curriculumChapters.subjectId, subjectId)).orderBy(asc(curriculumChapters.position))).map((r) => CurriculumChapterSchema.parse(r.content));
    },
    async chapter(subjectId, chapterId) {
      // One server-side read transaction sees one import snapshot.
      const [subjects, chapters, sections, blocks, points] = await db.batch([
        db.select().from(curriculumSubjects).where(eq(curriculumSubjects.id, subjectId)),
        db.select().from(curriculumChapters).where(and(eq(curriculumChapters.subjectId, subjectId), eq(curriculumChapters.id, chapterId))),
        db.select().from(curriculumSections).where(and(eq(curriculumSections.subjectId, subjectId), eq(curriculumSections.chapterId, chapterId))),
        db.select({ content: curriculumSourceBlocks.content }).from(curriculumSourceBlocks).innerJoin(curriculumSections, and(eq(curriculumSourceBlocks.subjectId, curriculumSections.subjectId), eq(curriculumSourceBlocks.sectionId, curriculumSections.id))).where(and(eq(curriculumSourceBlocks.subjectId, subjectId), eq(curriculumSections.chapterId, chapterId))),
        db.select({ content: curriculumKnowledgePoints.content }).from(curriculumKnowledgePoints).innerJoin(curriculumSections, and(eq(curriculumKnowledgePoints.subjectId, curriculumSections.subjectId), eq(curriculumKnowledgePoints.sectionId, curriculumSections.id))).where(and(eq(curriculumKnowledgePoints.subjectId, subjectId), eq(curriculumSections.chapterId, chapterId))),
      ]);
      if (!subjects[0] || !chapters[0]) return undefined;
      const chapter = CurriculumChapterSchema.parse(chapters[0].content);
      if (!chapter.readingOrder) throw new CurriculumReadingOrderError("Chapter requires explicit reading order");
      const byId = new Map(blocks.map((r) => [r.content.id, r.content]));
      if (chapter.readingOrder.length !== blocks.length || chapter.readingOrder.some((id) => !byId.has(id))) throw new CurriculumReadingOrderError("Chapter reading order is incomplete");
      return CurriculumChapterResponseSchema.parse({
        subject: subjects[0].content, chapter, sections: sections.map((r) => r.content),
        sourceBlocks: chapter.readingOrder.map((id) => byId.get(id)), knowledgePoints: points.map((r) => r.content),
      });
    },
    async questions(subjectId, chapterId) {
      const [rows, chapters] = await db.batch([
        db.select().from(curriculumQuestions).where(and(eq(curriculumQuestions.subjectId, subjectId), eq(curriculumQuestions.chapterId, chapterId))),
        db.select().from(curriculumChapters).where(and(eq(curriculumChapters.subjectId, subjectId), eq(curriculumChapters.id, chapterId))),
      ]);
      const questions = rows.map((r) => CurriculumQuestionSchema.parse(r.content));
      // Canonical Quiz block order defines order across Section-local positions.
      const [chapter] = chapters;
      if (!chapter) return [];
      const order = chapter.content.readingOrder;
      if (!order) throw new CurriculumReadingOrderError("Chapter requires explicit reading order");
      const ranks = new Map(order.map((id, i) => [id, i]));
      if (questions.some((q) => !ranks.has(q.transformation.sourceBlockId))) throw new CurriculumReadingOrderError("Quiz source missing from reading order");
      return questions.sort((a, b) => ranks.get(a.transformation.sourceBlockId)! - ranks.get(b.transformation.sourceBlockId)! || a.position - b.position);
    },
  };
}
