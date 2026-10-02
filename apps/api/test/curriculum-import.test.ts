import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { createCurriculumRepository } from "../src/db/curriculum.js";
import { createSyntheticCurriculum } from "./fixtures/curriculum-bundle.js";

const tables = [
  "exam_subjects", "exam_source_documents", "exam_chapters", "exam_sections", "exam_source_blocks",
  "exam_knowledge_points", "exam_questions", "exam_knowledge_point_sources", "exam_question_sources", "exam_question_knowledge_points",
];

test("Curriculum migration and production Neon batch importer execute against embedded PostgreSQL", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { tag: string }[] };
  for (const entry of journal.entries) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));

  // Replace only the Neon transport. Production Drizzle query builders, batch
  // driver and migration SQL execute unchanged in a real PostgreSQL transaction.
  type Query = { sql: string; params: unknown[] };
  const batches: Query[][] = [];
  const query = (sql: string, params: unknown[]) => ({ sql, params });
  const client = Object.assign(query, {
    query,
    async transaction(queries: Query[]) {
      batches.push(queries);
      return pg.transaction(async (tx) => {
        const results = [];
        for (const q of queries) {
          const result = await tx.query(q.sql, q.params);
          results.push({ ...result, rowCount: result.affectedRows ?? 0 });
        }
        return results;
      });
    },
  }) as unknown as NeonQueryFunction<false, false>;
  const repository = createCurriculumRepository(drizzle({ client }));
  const bundle = createSyntheticCurriculum();
  const other = createSyntheticCurriculum("synthetic-design");
  const importBundle = (input: unknown, expectedSubjectId = bundle.subject.id) => repository.importBundle(input, { expectedSubjectId });
  const snapshot = async (subjectId: string) => {
    const rows = [];
    for (const table of tables) rows.push((await pg.query(`select * from ${table} where ${table === "exam_subjects" ? "id" : "subject_id"} = $1 order by to_jsonb(${table})::text`, [subjectId])).rows);
    return rows;
  };

  await t.test("invalid bundle and wrong target are rejected before transport receives a transaction", async () => {
    await assert.rejects(importBundle({ ...bundle, knowledgePoints: [{ ...bundle.knowledgePoints[0], sourceBlockIds: [] }] }));
    await assert.rejects(importBundle({ ...bundle, questions: [{ ...bundle.questions[0], answer: { status: "official", correctChoiceIds: ["a"], sourceBlockIds: [] } }] }));
    await assert.rejects(importBundle({ ...bundle, knowledgePoints: [{ ...bundle.knowledgePoints[0], sectionId: "section-other" }] }));
    await assert.rejects(importBundle({ ...bundle, questions: [{ ...bundle.questions[1], answer: { status: "proposed", correctChoiceIds: ["a"], sourceBlockIds: [] } }] }));
    await assert.rejects(importBundle({ ...bundle, questions: [{ ...bundle.questions[0], origin: "textbook-derived" }] }));
    await assert.rejects(importBundle(bundle, "wrong-subject"), /target mismatch/);
    assert.equal(batches.length, 0);
    assert.equal((await pg.query("select * from exam_subjects")).rows.length, 0);
  });

  await t.test("complete bundle, nested sections and N:M relationships commit in one batch", async () => {
    const result = await importBundle(bundle);
    assert.deepEqual(result, { subjectId: bundle.subject.id, policy: "replace-subject", counts: { sourceDocuments: 1, chapters: 2, sections: 3, sourceBlocks: 3, knowledgePoints: 1, questions: 5 } });
    assert.equal(batches.length, 1);
    assert.match(batches[0][0].sql, /on conflict.*do update/);
    const blocks = await pg.query<{ content: unknown }>("select content from exam_source_blocks where id = 'block-body'");
    assert.deepEqual(blocks.rows[0].content, bundle.sourceBlocks[0]);
    assert.equal((await pg.query("select * from exam_knowledge_point_sources")).rows.length, 2);
    assert.equal((await pg.query("select * from exam_question_sources")).rows.length, 10);
    assert.equal((await pg.query("select * from exam_question_knowledge_points")).rows.length, 5);
  });

  await t.test("identical re-import is idempotent and IDs remain stable", async () => {
    const before = await snapshot(bundle.subject.id);
    await importBundle(bundle);
    assert.deepEqual(await snapshot(bundle.subject.id), before);
  });

  await t.test("a failed statement rolls back Subject update, deletion and every prior insert", async () => {
    const before = await snapshot(bundle.subject.id);
    // A database error near the end of the actual production batch, after the
    // parent upsert, deletion, hierarchy and assessment writes have succeeded.
    await pg.exec(`
      create function fail_curriculum_test() returns trigger language plpgsql as $$
      begin raise exception 'synthetic import failure'; end; $$;
      create trigger fail_curriculum_test before insert on exam_question_sources
      for each row execute function fail_curriculum_test();
    `);
    const changed = createSyntheticCurriculum();
    changed.subject.title = "Changed before failing";
    await assert.rejects(importBundle(changed), /synthetic import failure/);
    assert.deepEqual(await snapshot(bundle.subject.id), before);
    const newSubject = createSyntheticCurriculum("synthetic-failed");
    await assert.rejects(importBundle(newSubject, newSubject.subject.id), /synthetic import failure/);
    assert.deepEqual(await snapshot(newSubject.subject.id), tables.map(() => []));
    await pg.exec("drop trigger fail_curriculum_test on exam_question_sources; drop function fail_curriculum_test();");
  });

  await t.test("replacement removes omitted children only from the explicit target Subject", async () => {
    await importBundle(other, other.subject.id);
    await pg.query("insert into exam_banks values ('aws-sap', 'sap-drill-bank.v1', 'Synthetic legacy', 'test', 'test', null)");
    const otherBefore = await snapshot(other.subject.id);
    const legacyBefore = (await pg.query("select * from exam_banks")).rows;
    const changed = createSyntheticCurriculum();
    changed.subject.title = "Revised synthetic title";
    changed.chapters = changed.chapters.filter((c) => c.id === "chapter-1");
    changed.sections = changed.sections.filter((s) => s.id !== "section-other");
    changed.questions = [];
    changed.knowledgePoints = [];
    await importBundle(changed);
    assert.deepEqual(await snapshot(other.subject.id), otherBefore);
    assert.deepEqual((await pg.query("select * from exam_banks")).rows, legacyBefore);
    assert.equal((await pg.query("select * from exam_questions where subject_id = $1", [bundle.subject.id])).rows.length, 0);
    assert.equal((await pg.query("select * from exam_question_sources where subject_id = $1", [bundle.subject.id])).rows.length, 0);
    assert.equal((await pg.query("select * from exam_knowledge_point_sources where subject_id = $1", [bundle.subject.id])).rows.length, 0);
    assert.equal((await pg.query("select * from exam_chapters where subject_id = $1", [bundle.subject.id])).rows.length, 1);
    // Restore for constraint checks below.
    await importBundle(bundle);
  });

  await t.test("DB compound FKs and ordering constraints reject invalid direct writes", async () => {
    const subjectId = bundle.subject.id;
    await assert.rejects(pg.query("insert into exam_sections values ($1, 'bad-parent', 'chapter-1', 'section-other', 10, '{}')", [subjectId]), /exam_sections_parent_fk/);
    await assert.rejects(pg.query("insert into exam_sections values ($1, 'duplicate-order', 'chapter-1', null, 0, '{}')", [subjectId]), /exam_sections_root_order_unique/);
    await assert.rejects(pg.query("insert into exam_chapters values ($1, 'negative-order', -1, '{}')", [subjectId]), /exam_chapters_position_check/);
    await assert.rejects(pg.query("insert into exam_source_blocks values ('missing-subject', 'bad-block', 'section-root', 'document-1', 0, 'revision-1', '{}')"), /foreign key/);
    await assert.rejects(pg.query("insert into exam_knowledge_point_sources values ($1, 'knowledge-1', 'missing-block')", [subjectId]), /exam_kp_sources_block_fk/);
    await assert.rejects(pg.query("insert into exam_questions values ($1, 'bad-question', 'chapter-1', 'section-child', 10, 'block-quiz', 'old-revision', '{}')", [subjectId]), /exam_questions_source_revision_fk/);
  });

  await t.test("large collections are split into statements inside one transaction", async () => {
    const large = createSyntheticCurriculum();
    for (let i = 1; i <= 401; i++) large.sourceBlocks.push({ ...large.sourceBlocks[0], id: `extra-block-${i}`, position: i });
    const batchCount = batches.length;
    const result = await importBundle(large);
    assert.equal(batches.length, batchCount + 1);
    assert.equal(result.counts.sourceBlocks, 404);
    assert.equal((await pg.query("select * from exam_source_blocks where subject_id = $1", [large.subject.id])).rows.length, 404);
    const blockInserts = batches.at(-1)!.filter((q) => q.sql.startsWith('insert into "exam_source_blocks"'));
    assert.equal(blockInserts.length, 3);
    assert.ok(blockInserts.every((q) => q.params.length <= 200 * 7));
  });

  await t.test("financial context and case roles survive JSONB import and re-import", async () => {
    const financial = createSyntheticCurriculum();
    financial.sourceBlocks[0].role = "financial-context";
    financial.sourceBlocks.push({ ...financial.sourceBlocks[0], id: "block-financial-case", position: 1, role: "financial-case" });
    await importBundle(financial);
    const result = await pg.query<{ content: { role: string } }>("select content from exam_source_blocks where subject_id = $1 and id in ('block-body', 'block-financial-case') order by id", [financial.subject.id]);
    assert.deepEqual(result.rows.map((row) => row.content.role), ["financial-context", "financial-case"]);
    const before = await snapshot(financial.subject.id);
    await importBundle(financial);
    assert.deepEqual(await snapshot(financial.subject.id), before);
  });
});
