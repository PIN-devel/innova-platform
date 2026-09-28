import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ExamBank } from "@innova/contracts";
import { createExamBank, getExamBank } from "./api";

export const examBankKeys = {
  all: ["exam-bank"] as const,
  detail: (id: string) => [...examBankKeys.all, id] as const,
};

export const examBankQuery = (id: string) => queryOptions({
  queryKey: examBankKeys.detail(id), queryFn: () => getExamBank(id),
  staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30, retry: false,
});

export async function createCachedExamBank(queryClient: QueryClient, bank: ExamBank) {
  const saved = await createExamBank(bank);
  queryClient.setQueryData(examBankKeys.detail(saved.id), saved);
  return saved;
}

export async function refreshDefaultExamBank(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: examBankKeys.detail("aws-sap"), refetchType: "none" });
  return queryClient.fetchQuery(examBankQuery("aws-sap"));
}
