import { randomUUID } from "node:crypto";
import type { CacheStore } from "@innova/auth-kit";
import type { ExamBank, ExamBankRecord } from "@innova/contracts";
import { eq } from "drizzle-orm";
import type { createDatabase } from "./client.js";
import { examBanks, examConcepts, examScenarios } from "./schema.js";

export const DEFAULT_EXAM_BANK_ID = "aws-sap";
const DEFAULT_EXAM_BANK_CACHE_TTL_MS = 300_000;

export function examBankCacheKey(id: string): string {
  return `learning:exam-bank:${id}`;
}

export interface ExamRepository {
  find(id: string): Promise<ExamBankRecord | undefined>;
  create(bank: ExamBank): Promise<ExamBankRecord>;
}

export function createExamRepository(db: ReturnType<typeof createDatabase>): ExamRepository {
  return {
    async find(id) {
      const [row] = await db.select().from(examBanks).where(eq(examBanks.id, id));
      if (!row) return undefined;
      const [concepts, scenarios] = await Promise.all([
        db.select({ content: examConcepts.content }).from(examConcepts).where(eq(examConcepts.bankId, id)).orderBy(examConcepts.id),
        db.select({ content: examScenarios.content }).from(examScenarios).where(eq(examScenarios.bankId, id)).orderBy(examScenarios.id),
      ]);
      return {
        id,
        bank: {
          schema: row.schema as ExamBank["schema"],
          subject: row.subject,
          source: row.source,
          generatedAt: row.generatedAt,
          ...(row.notes === null ? {} : { notes: row.notes }),
          concepts: concepts.map((concept) => concept.content),
          scenarios: scenarios.map((scenario) => scenario.content),
        },
      };
    },
    async create(bank) {
      const id = randomUUID();
      await db.insert(examBanks).values({
        id,
        schema: bank.schema,
        subject: bank.subject,
        source: bank.source,
        generatedAt: bank.generatedAt,
        notes: bank.notes,
      });
      try {
        if (bank.concepts.length) {
          await db.insert(examConcepts).values(
            bank.concepts.map((concept) => ({
              bankId: id,
              id: concept.id,
              chapter: concept.chapter,
              deck: concept.deck,
              term: concept.term,
              content: concept,
            }))
          );
        }
        if (bank.scenarios.length) {
          await db.insert(examScenarios).values(
            bank.scenarios.map((scenario) => ({
              bankId: id,
              id: scenario.id,
              chapter: scenario.chapter,
              content: scenario,
            }))
          );
        }
      } catch (error) {
        await db.delete(examBanks).where(eq(examBanks.id, id));
        throw error;
      }
      return { id, bank };
    },
  };
}

/**
 * Wraps an `ExamRepository` with Cache-Aside reads and invalidation on create.
 * Cache failures fall open to the underlying repository.
 */
export function createCachedExamRepository(
  delegate: ExamRepository,
  cacheStore: CacheStore,
  ttlMs = DEFAULT_EXAM_BANK_CACHE_TTL_MS,
): ExamRepository {
  return {
    async find(id) {
      const key = examBankCacheKey(id);
      const cached = await cacheStore.get<ExamBankRecord>(key).catch(() => undefined);
      if (cached) return cached;

      const record = await delegate.find(id);
      if (record) {
        await cacheStore.set(key, record, ttlMs).catch(() => undefined);
      }
      return record;
    },

    async create(bank) {
      const created = await delegate.create(bank);
      await cacheStore.set(examBankCacheKey(created.id), created, ttlMs).catch(() => undefined);
      return created;
    },
  };
}
