import { z } from "zod";
import {
  CurriculumIdSchema, CurriculumSubjectSchema, CurriculumChapterSchema, CurriculumSectionSchema,
  CurriculumSourceBlockSchema, CurriculumKnowledgePointSchema, CurriculumRichContentSchema,
  type CurriculumQuestion,
} from "./curriculum.js";

export const CurriculumSubjectsResponseSchema = z.strictObject({ subjects: z.array(CurriculumSubjectSchema) });
export const CurriculumChaptersResponseSchema = z.strictObject({ subject: CurriculumSubjectSchema, chapters: z.array(CurriculumChapterSchema) });
export const CurriculumChapterResponseSchema = z.strictObject({
  subject: CurriculumSubjectSchema, chapter: CurriculumChapterSchema,
  sections: z.array(CurriculumSectionSchema), sourceBlocks: z.array(CurriculumSourceBlockSchema),
  knowledgePoints: z.array(CurriculumKnowledgePointSchema),
}).superRefine((value, ctx) => {
  const order = value.chapter.readingOrder;
  const ids = new Set(value.sourceBlocks.map((b) => b.id));
  const sections = new Map(value.sections.map((s) => [s.id, s]));
  if (!order || order.length !== ids.size || order.some((id, i) => id !== value.sourceBlocks[i]?.id)) {
    ctx.addIssue({ code: "custom", message: "Chapter blocks must follow explicit reading order", path: ["sourceBlocks"] });
  }
  if (value.chapter.subjectId !== value.subject.id || value.sections.some((s) => s.chapterId !== value.chapter.id || s.subjectId !== value.subject.id)
    || value.sourceBlocks.some((b) => b.subjectId !== value.subject.id || !sections.has(b.sectionId))
    || value.knowledgePoints.some((k) => k.subjectId !== value.subject.id || !sections.has(k.sectionId))) {
    ctx.addIssue({ code: "custom", message: "Chapter response scope mismatch", path: ["chapter"] });
  }
});

const quizBase = { id: CurriculumIdSchema, prompt: CurriculumRichContentSchema, knowledgePointIds: z.array(CurriculumIdSchema), answerStatus: z.enum(["official", "proposed", "unresolved"]) };
export const CurriculumQuizQuestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...quizBase, kind: z.enum(["single-choice", "multiple-choice"]), choices: z.array(z.strictObject({ id: CurriculumIdSchema, content: CurriculumRichContentSchema })).min(2) }),
  z.strictObject({ ...quizBase, kind: z.literal("short-answer"), matching: z.enum(["exact", "case-insensitive"]).nullable() }),
  z.strictObject({ ...quizBase, kind: z.literal("self-assessment") }),
]);
export const CurriculumQuizResponseSchema = z.strictObject({ subjectId: CurriculumIdSchema, chapterId: CurriculumIdSchema, questions: z.array(CurriculumQuizQuestionSchema) });
const choiceIds = z.array(CurriculumIdSchema).min(1).refine((ids) => new Set(ids).size === ids.length, "Duplicate choice");
export const CurriculumAnswerSubmissionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["single-choice", "multiple-choice"]), choiceIds }),
  z.strictObject({ kind: z.literal("short-answer"), text: z.string().max(10000) }),
  z.strictObject({ kind: z.literal("self-assessment") }),
]);
const answerEvidence = { status: z.enum(["official", "proposed"]), sourceBlockIds: z.array(CurriculumIdSchema).min(1), explanation: CurriculumRichContentSchema.optional() };
export const CurriculumGradeResponseSchema = z.strictObject({
  questionId: CurriculumIdSchema, correct: z.boolean().nullable(),
  answer: z.union([
    z.strictObject({ status: z.literal("unresolved"), reason: z.string().min(1) }),
    z.strictObject({ ...answerEvidence, correctChoiceIds: z.array(CurriculumIdSchema).min(1) }),
    z.strictObject({ ...answerEvidence, acceptedAnswers: z.array(z.string().min(1)).min(1), matching: z.enum(["exact", "case-insensitive"]) }),
    z.strictObject({ ...answerEvidence, rubric: CurriculumRichContentSchema, sampleAnswer: CurriculumRichContentSchema.optional() }),
  ]),
});

export type CurriculumChapterResponse = z.infer<typeof CurriculumChapterResponseSchema>;
export type CurriculumQuizQuestion = z.infer<typeof CurriculumQuizQuestionSchema>;
export type CurriculumQuizResponse = z.infer<typeof CurriculumQuizResponseSchema>;
export type CurriculumAnswerSubmission = z.infer<typeof CurriculumAnswerSubmissionSchema>;
export type CurriculumGradeResponse = z.infer<typeof CurriculumGradeResponseSchema>;

export function toCurriculumQuizQuestion(q: CurriculumQuestion): CurriculumQuizQuestion {
  const base = { id: q.id, prompt: q.prompt, knowledgePointIds: q.knowledgePointIds, answerStatus: q.answer.status };
  if ("choices" in q) return { ...base, kind: q.kind, choices: q.choices };
  if (q.kind === "short-answer") return { ...base, kind: q.kind, matching: q.answer.status === "unresolved" ? null : q.answer.matching };
  return { ...base, kind: q.kind };
}

// Exact means literal equality, including case, whitespace and Unicode. The
// only alternate policy here is the contract's explicit case-insensitive mode.
export function gradeCurriculumAnswer(q: CurriculumQuestion, input: CurriculumAnswerSubmission): CurriculumGradeResponse {
  if (q.kind !== input.kind) throw new Error("Answer kind mismatch");
  let correct: boolean | null = null;
  if ("choices" in q && "choiceIds" in input) {
    if ((q.kind === "single-choice" && input.choiceIds.length !== 1) || input.choiceIds.some((id) => !q.choices.some((c) => c.id === id))) throw new Error("Invalid answer choices");
    if (q.answer.status !== "unresolved") correct = input.choiceIds.length === q.answer.correctChoiceIds.length && input.choiceIds.every((id) => q.answer.status !== "unresolved" && q.answer.correctChoiceIds.includes(id));
  } else if (q.kind === "short-answer" && input.kind === "short-answer" && q.answer.status !== "unresolved") {
    const match = q.answer.matching === "exact" ? (a: string) => a : (a: string) => a.toLowerCase();
    correct = q.answer.acceptedAnswers.some((a) => match(a) === match(input.text));
  }
  return { questionId: q.id, correct, answer: q.answer };
}
