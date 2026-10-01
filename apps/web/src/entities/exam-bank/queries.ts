import { queryOptions } from "@tanstack/react-query";
import { getExamBank } from "./api";

export const examBankKeys = {
  all: ["exam-bank"] as const,
  detail: (id: string, epoch = 0) => [...examBankKeys.all, epoch, id] as const,
};

export const examBankQuery = (id: string, epoch = 0) => queryOptions({
  queryKey: examBankKeys.detail(id, epoch), meta: { sessionVersion: epoch }, queryFn: ({ signal }) => getExamBank(id, signal),
  staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30, retry: false,
});
