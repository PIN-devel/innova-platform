import { queryOptions } from "@tanstack/react-query";
import { getExamBank } from "./api";

export const examBankQuery = (id: string) => queryOptions({
  queryKey: ["exam-bank", id], queryFn: () => getExamBank(id),
  staleTime: 0, gcTime: 0, retry: false,
});
