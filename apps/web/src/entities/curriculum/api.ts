import { CurriculumSubjectsResponseSchema, CurriculumChaptersResponseSchema, CurriculumChapterResponseSchema, CurriculumQuizResponseSchema, CurriculumGradeResponseSchema, type CurriculumAnswerSubmission } from "@innova/contracts";
import { apiClient } from "@/shared/api/client";

const init = { cache: "no-store" } as const;
export const curriculumSubjectPath = (subjectId: string) => `/curriculum/subjects/${encodeURIComponent(subjectId)}`;
export const curriculumChapterPath = (subjectId: string, chapterId: string) => `${curriculumSubjectPath(subjectId)}/chapters/${encodeURIComponent(chapterId)}`;
export async function getCurriculumSubjects(signal?: AbortSignal) {
  return CurriculumSubjectsResponseSchema.parse(await apiClient.get("/curriculum/subjects", { ...init, signal }));
}
export async function getCurriculumChapters(subjectId: string, signal?: AbortSignal) {
  return CurriculumChaptersResponseSchema.parse(await apiClient.get(`${curriculumSubjectPath(subjectId)}/chapters`, { ...init, signal }));
}
export async function getCurriculumChapter(subjectId: string, chapterId: string, signal?: AbortSignal) {
  return CurriculumChapterResponseSchema.parse(await apiClient.get(curriculumChapterPath(subjectId, chapterId), { ...init, signal }));
}
export async function getCurriculumQuiz(subjectId: string, chapterId: string, signal?: AbortSignal) {
  return CurriculumQuizResponseSchema.parse(await apiClient.get(`${curriculumChapterPath(subjectId, chapterId)}/quiz`, { ...init, signal }));
}
export async function submitCurriculumAnswer(subjectId: string, chapterId: string, questionId: string, input: CurriculumAnswerSubmission) {
  return CurriculumGradeResponseSchema.parse(await apiClient.post(`${curriculumChapterPath(subjectId, chapterId)}/questions/${encodeURIComponent(questionId)}/grade`, input, init));
}
export function curriculumAssetUrl(subjectId: string, chapterId: string, blockId: string, index: number) {
  const base = (import.meta.env?.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
  return `${base}${curriculumChapterPath(subjectId, chapterId)}/blocks/${encodeURIComponent(blockId)}/assets/${index}`;
}
