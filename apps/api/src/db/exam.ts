import { randomUUID } from "node:crypto";
import type { ExamBank, ExamBankRecord } from "@innova/contracts";
import { eq } from "drizzle-orm";
import type { createDatabase } from "./client.js";
import { examBanks, examConcepts, examScenarios } from "./schema.js";

export const DEFAULT_EXAM_BANK_ID = "aws-sap";

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
          schema: row.schema as ExamBank["schema"], subject: row.subject,
          source: row.source, generatedAt: row.generatedAt,
          ...(row.notes === null ? {} : { notes: row.notes }),
          concepts: concepts.map((concept) => concept.content),
          scenarios: scenarios.map((scenario) => scenario.content),
        },
      };
    },
    async create(bank) {
      const id = randomUUID();
      await db.insert(examBanks).values({ id, schema: bank.schema, subject: bank.subject, source: bank.source, generatedAt: bank.generatedAt, notes: bank.notes });
      try {
        if (bank.concepts.length) await db.insert(examConcepts).values(bank.concepts.map((concept) => ({ bankId: id, id: concept.id, chapter: concept.chapter, deck: concept.deck, term: concept.term, content: concept })));
        if (bank.scenarios.length) await db.insert(examScenarios).values(bank.scenarios.map((scenario) => ({ bankId: id, id: scenario.id, chapter: scenario.chapter, content: scenario })));
      } catch (error) {
        await db.delete(examBanks).where(eq(examBanks.id, id));
        throw error;
      }
      return { id, bank };
    },
  };
}
