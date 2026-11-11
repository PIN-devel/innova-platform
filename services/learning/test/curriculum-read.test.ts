import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { createCurriculumRepository } from "../src/db/curriculum.js";
import { createCurriculumReadRepository, CurriculumReadingOrderError } from "../src/db/curriculum-read.js";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";

test("production SQL read repository scopes Subjects/Chapters and preserves canonical interleaving", async (t) => {
  const pg = new PGlite(); t.after(() => pg.close());
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  type Query = { sql: string; params: unknown[]; options?: { arrayMode?: boolean } };
  const execute = async (tx: Pick<PGlite, "query">, q: Query) => {
    const result = await tx.query(q.sql, q.params);
    return { ...result, rowCount: result.affectedRows ?? 0, rows: q.options?.arrayMode ? result.rows.map((r) => result.fields.map((f) => (r as Record<string, unknown>)[f.name])) : result.rows };
  };
  const query = (sql: string, params: unknown[], options?: Query["options"]) => {
    const q = { sql, params, options };
    return { ...q, then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => execute(pg, q).then(resolve, reject) };
  };
  const client = Object.assign(query, { query, async transaction(queries: Query[]) { return pg.transaction(async (tx) => { const result = []; for (const q of queries) result.push(await execute(tx, q)); return result; }); } }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle({ client }); const importer = createCurriculumRepository(db); const reader = createCurriculumReadRepository(db);
  const b = createSyntheticCurriculum();
  b.sourceBlocks.push({ ...b.sourceBlocks[0], id: "parent-continuation", position: 1 });
  const chapter = b.chapters.find((c) => c.id === "chapter-1")!;
  chapter.readingOrder = ["block-body", "block-quiz", "parent-continuation", "block-answer"];
  b.sourceBlocks.reverse();
  await importer.importBundle(b, { expectedSubjectId: b.subject.id });
  const other = createSyntheticCurriculum("synthetic-other");
  await importer.importBundle(other, { expectedSubjectId: other.subject.id });
  assert.equal((await reader.subjects()).length, 2);
  assert.equal(await reader.subject("missing"), undefined);
  assert.deepEqual((await reader.chapters(b.subject.id)).map((c) => c.id), ["chapter-1", "chapter-2"]);
  assert.deepEqual((await reader.chapter(b.subject.id, chapter.id))?.sourceBlocks.map((s) => s.id), chapter.readingOrder);
  assert.equal((await reader.chapter(b.subject.id, chapter.id))?.sections.length, 2);
  assert.equal((await reader.chapter(b.subject.id, chapter.id))?.knowledgePoints.length, 1);
  assert.equal(await reader.chapter("missing", chapter.id), undefined);
  assert.deepEqual((await reader.questions(b.subject.id, chapter.id)).map((q) => q.id), b.questions.map((q) => q.id));
  assert.deepEqual(await reader.questions("missing", chapter.id), []);
  await assert.rejects(reader.chapter(other.subject.id, chapter.id), CurriculumReadingOrderError);
  await assert.rejects(reader.questions(other.subject.id, chapter.id), CurriculumReadingOrderError);
});
