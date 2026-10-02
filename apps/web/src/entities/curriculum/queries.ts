import { queryOptions } from "@tanstack/react-query";
import { getCurriculumSubjects, getCurriculumChapters, getCurriculumChapter, getCurriculumQuiz } from "./api";

export const curriculumKeys = {
  all: ["curriculum"] as const,
  subjects: (epoch: number) => ["curriculum", epoch, "subjects"] as const,
  chapters: (subject: string, epoch: number) => ["curriculum", epoch, subject, "chapters"] as const,
  chapter: (subject: string, chapter: string, epoch: number) => ["curriculum", epoch, subject, chapter, "reading"] as const,
  quiz: (subject: string, chapter: string, epoch: number) => ["curriculum", epoch, subject, chapter, "quiz"] as const,
};
const policy = (epoch: number) => ({ staleTime: 300000, gcTime: 1800000, retry: false, meta: { sessionVersion: epoch } });
export const curriculumSubjectsQuery = (epoch = 0) => queryOptions({ ...policy(epoch), queryKey: curriculumKeys.subjects(epoch), queryFn: ({ signal }) => getCurriculumSubjects(signal) });
export const curriculumChaptersQuery = (subject: string, epoch = 0) => queryOptions({ ...policy(epoch), queryKey: curriculumKeys.chapters(subject, epoch), queryFn: ({ signal }) => getCurriculumChapters(subject, signal) });
export const curriculumChapterQuery = (subject: string, chapter: string, epoch = 0) => queryOptions({ ...policy(epoch), queryKey: curriculumKeys.chapter(subject, chapter, epoch), queryFn: ({ signal }) => getCurriculumChapter(subject, chapter, signal) });
export const curriculumQuizQuery = (subject: string, chapter: string, epoch = 0) => queryOptions({ ...policy(epoch), queryKey: curriculumKeys.quiz(subject, chapter, epoch), queryFn: ({ signal }) => getCurriculumQuiz(subject, chapter, signal) });
