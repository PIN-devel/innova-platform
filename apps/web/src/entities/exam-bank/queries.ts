import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ExamBank } from "@innova/contracts";
import { createExamBank, getExamBank } from "./api";
import { assertSessionVersion, getSessionVersion } from "@/entities/auth/session-version";

export const examBankKeys = {
  all: ["exam-bank"] as const,
  detail: (id: string) => [...examBankKeys.all, id] as const,
};

export const examBankQuery = (id: string) => queryOptions({
  queryKey: examBankKeys.detail(id), queryFn: ({ signal }) => getExamBank(id, signal),
  staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30, retry: false,
});

export async function createCachedExamBank(queryClient: QueryClient, bank: ExamBank) {
  const version = getSessionVersion(queryClient);
  try {
    const saved = await createExamBank(bank);
    assertSessionVersion(queryClient, version);
    queryClient.setQueryData(examBankKeys.detail(saved.id), saved);
    return saved;
  } catch (error) {
    assertSessionVersion(queryClient, version);
    throw error;
  }
}

export async function refreshDefaultExamBank(queryClient: QueryClient) {
  const version = getSessionVersion(queryClient);
  await queryClient.invalidateQueries({ queryKey: examBankKeys.detail("aws-sap"), refetchType: "none" });
  assertSessionVersion(queryClient, version);
  const bank = await queryClient.fetchQuery(examBankQuery("aws-sap"));
  assertSessionVersion(queryClient, version);
  return bank;
}
