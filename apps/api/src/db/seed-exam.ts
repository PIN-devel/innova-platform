import "dotenv/config";
import { readFile } from "node:fs/promises";
import { ExamBankSchema } from "@innova/contracts";
import { notInArray, eq, sql } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { DEFAULT_EXAM_BANK_ID } from "./exam.js";
import { examBanks, examConcepts, examScenarios } from "./schema.js";

async function main() {
  const seedPath = process.env.EXAM_BANK_SEED_PATH;
  if (!seedPath) throw new Error("EXAM_BANK_SEED_PATH is required; use a private file outside Git");
  const raw = JSON.parse(await readFile(seedPath, "utf8"));
  const bank = ExamBankSchema.parse(raw);
  const db = createDatabase();
  await db.insert(examBanks).values({
    id: DEFAULT_EXAM_BANK_ID, schema: bank.schema, subject: bank.subject,
    source: bank.source, generatedAt: bank.generatedAt, notes: bank.notes,
  }).onConflictDoUpdate({ target: examBanks.id, set: {
    schema: bank.schema, subject: bank.subject, source: bank.source,
    generatedAt: bank.generatedAt, notes: bank.notes,
  } });
  if (bank.concepts.length > 0) {
    await db.insert(examConcepts).values(bank.concepts.map((concept) => ({
      bankId: DEFAULT_EXAM_BANK_ID, id: concept.id, chapter: concept.chapter,
      deck: concept.deck, term: concept.term, content: concept,
    }))).onConflictDoUpdate({ target: [examConcepts.bankId, examConcepts.id], set: {
      chapter: sql`excluded.chapter`, deck: sql`excluded.deck`,
      term: sql`excluded.term`, content: sql`excluded.content`,
    } });
  }
  if (bank.scenarios.length > 0) {
    await db.insert(examScenarios).values(bank.scenarios.map((scenario) => ({
      bankId: DEFAULT_EXAM_BANK_ID, id: scenario.id, chapter: scenario.chapter, content: scenario,
    }))).onConflictDoUpdate({ target: [examScenarios.bankId, examScenarios.id], set: {
      chapter: sql`excluded.chapter`, content: sql`excluded.content`,
    } });
  }
  await db.delete(examConcepts).where(bank.concepts.length > 0
    ? sql`${examConcepts.bankId} = ${DEFAULT_EXAM_BANK_ID} AND ${notInArray(examConcepts.id, bank.concepts.map((note) => note.id))}`
    : eq(examConcepts.bankId, DEFAULT_EXAM_BANK_ID));
  await db.delete(examScenarios).where(bank.scenarios.length > 0
    ? sql`${examScenarios.bankId} = ${DEFAULT_EXAM_BANK_ID} AND ${notInArray(examScenarios.id, bank.scenarios.map((note) => note.id))}`
    : eq(examScenarios.bankId, DEFAULT_EXAM_BANK_ID));
  const [conceptCount, scenarioCount] = await Promise.all([
    db.select({ id: examConcepts.id }).from(examConcepts).where(eq(examConcepts.bankId, DEFAULT_EXAM_BANK_ID)),
    db.select({ id: examScenarios.id }).from(examScenarios).where(eq(examScenarios.bankId, DEFAULT_EXAM_BANK_ID)),
  ]);
  if (conceptCount.length !== bank.concepts.length || scenarioCount.length !== bank.scenarios.length) throw new Error("Exam bank seed count mismatch");
  console.log(`Seeded ${bank.subject}: ${conceptCount.length} concepts, ${scenarioCount.length} scenarios`);
}

await main();
