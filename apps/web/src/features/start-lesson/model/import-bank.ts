import type { QueryClient } from "@tanstack/react-query";
import { ExamBankSchema, type ExamBank } from "@innova/contracts";
import { createExamBank } from "@/entities/exam-bank/api";
import { examBankKeys } from "@/entities/exam-bank/queries";
import { assertSessionVersion, getSessionVersion } from "@/entities/auth/session-version";
import { handleSessionApiError } from "@/features/auth/clear-protected-queries";

export class ExamBankImportError extends Error {
  readonly reason: "busy" | "missing-current";
  constructor(reason: "busy" | "missing-current") {
    super(reason === "busy" ? "문항을 저장 중입니다." : "현재 문항 은행을 먼저 불러와 주세요.");
    this.reason = reason;
  }
}

export function mergeExamBanks(current: ExamBank, incoming: ExamBank): ExamBank {
  return {
    ...incoming,
    concepts: [...new Map([...current.concepts, ...incoming.concepts].map((note) => [note.id, note])).values()],
    scenarios: [...new Map([...current.scenarios, ...incoming.scenarios].map((note) => [note.id, note])).values()],
  };
}

const imports = new WeakSet<QueryClient>();
export async function importExamBank(client: QueryClient, input: {
  source: { text(): Promise<string> };
  mode: "merge" | "replace";
  currentBankId: string;
  epoch: number;
  signal: AbortSignal;
}) {
  if (imports.has(client)) throw new ExamBankImportError("busy");
  imports.add(client);
  try {
    const incoming = ExamBankSchema.parse(JSON.parse(await input.source.text()));
    assertSessionVersion(client, input.epoch);
    input.signal.throwIfAborted();
    const current = client.getQueryData<{ bank: ExamBank }>(examBankKeys.detail(input.currentBankId, input.epoch))?.bank;
    if (input.mode === "merge" && !current) throw new ExamBankImportError("missing-current");
    const bank = input.mode === "replace" ? incoming : mergeExamBanks(current!, incoming);
    const saved = await createCachedExamBank(client, bank);
    assertSessionVersion(client, input.epoch);
    return saved;
  } catch (error) {
    assertSessionVersion(client, input.epoch);
    handleSessionApiError(client, error);
    throw error;
  } finally {
    imports.delete(client);
  }
}

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
