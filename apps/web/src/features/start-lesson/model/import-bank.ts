import type { QueryClient } from "@tanstack/react-query";
import type { ExamBank } from "@innova/contracts";
import { createExamBank } from "@/entities/exam-bank/api";
import { examBankKeys } from "@/entities/exam-bank/queries";
import { assertSessionVersion, getSessionVersion } from "@/entities/auth/session-version";

export async function createCachedExamBank(queryClient: QueryClient, bank: ExamBank) {
  const version = getSessionVersion(queryClient);
  try {
    const saved = await createExamBank(bank);
    assertSessionVersion(queryClient, version);
    queryClient.setQueryData(examBankKeys.detail(saved.id, version), saved);
    return saved;
  } catch (error) {
    assertSessionVersion(queryClient, version);
    throw error;
  }
}
