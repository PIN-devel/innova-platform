import type { QueryClient } from "@tanstack/react-query";
import type { CurriculumAnswerSubmission } from "@innova/contracts";
import { submitCurriculumAnswer } from "@/entities/curriculum/api";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { handleSessionApiError } from "@/features/auth/clear-protected-queries";

export async function submitAnswer(client: QueryClient, epoch: number, subject: string, chapter: string, question: string, input: CurriculumAnswerSubmission) {
  assertSessionVersion(client, epoch);
  try {
    const result = await submitCurriculumAnswer(subject, chapter, question, input);
    assertSessionVersion(client, epoch);
    return result;
  } catch (error) {
    assertSessionVersion(client, epoch);
    handleSessionApiError(client, error);
    throw error;
  }
}
