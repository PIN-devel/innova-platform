import type { ExamBank, ExamBankRecord } from "@innova/contracts";
import { apiClient } from "@/shared/api/client";

const examRequestInit: RequestInit = { cache: "no-store" };

export function getExamBank(id: string): Promise<ExamBankRecord> {
  return apiClient.get(`/exam/banks/${id === "aws-sap" ? "default" : encodeURIComponent(id)}`, examRequestInit);
}

export function createExamBank(bank: ExamBank): Promise<ExamBankRecord> {
  return apiClient.post("/exam/banks", bank, examRequestInit);
}
