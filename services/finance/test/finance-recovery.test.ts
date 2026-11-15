import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { manualSaveSchema } from '@innova/contracts';
import { createFinanceRawRepository } from '../src/db/finance-raw.js';
import { createFinanceBusinessRepository, createBusinessFingerprint } from '../src/db/finance-business.js';
import { createFinanceManualRepository } from '../src/db/finance-manual.js';
import { createFinanceClassificationRepository } from '../src/db/finance-classification.js';
import { createFinanceScheduleRepository } from '../src/db/finance-schedule.js';
import { createFinanceTransactionRepository } from '../src/db/finance-transactions.js';
import { createPdfPasswordRepository, type PdfSecretContext } from '../src/db/finance-pdf-password.js';
import { createRawCipher } from '../src/finance-raw-crypto.js';
import { createPdfPasswordCipher } from '../src/finance-pdf-crypto.js';
import { bankSource, cardSource } from './fixtures/finance-raw.js';

// A synthetic runbook rehearsal across service DBs, not a production export/restore endpoint.
const rawTables = [
  'finance_raw_batches',
  'finance_raw_files',
  'finance_raw_rows',
  'finance_business_scopes',
  'finance_business_documents',
  'finance_business_events',
] as const;

// Foreign-key safe insertion order for owner-scoped selective restore.
const ownerScopedFinanceTables = [
  'finance_raw_batches',
  'finance_raw_files',
  'finance_raw_rows',
  'finance_business_scopes',
  'finance_business_documents',
  'finance_business_events',
  'finance_classification_workspaces',
  'finance_classification_revisions',
  'finance_schedule_workspaces',
  'finance_schedule_revisions',
  'finance_pdf_secrets',
  'finance_pdf_secret_attempts',
  'finance_manual_transactions',
  'finance_transaction_operations',
  'finance_deleted_transactions',
] as const;

const RAW_KEY = 'ac'.repeat(32);
const PDF_KEYRING = JSON.stringify({ v1: 'cd'.repeat(32), v2: 'ef'.repeat(32) });

async function applyMigrations(pg: PGlite, relativeDrizzleDir: string) {
  const journal = JSON.parse(await readFile(new URL(`${relativeDrizzleDir}/meta/_journal.json`, import.meta.url), 'utf8'));
  for (const entry of journal.entries) {
    await pg.exec(await readFile(new URL(`${relativeDrizzleDir}/${entry.tag}.sql`, import.meta.url), 'utf8'));
  }
}

async function createServicePg(relativeDrizzleDir: string) {
  const pg = new PGlite();
  await applyMigrations(pg, relativeDrizzleDir);
  return pg;
}

async function financeDatabase(activePdfKeyVersion = 'v1') {
  const pg = await createServicePg('../drizzle');
  const query = async (sql: string, params: unknown[], options?: { arrayMode?: boolean }) => {
    const r = await pg.query(sql, params);
    return {
      ...r,
      rowCount: r.affectedRows ?? r.rows.length,
      rows: options?.arrayMode ? r.rows.map((row) => Object.values(row as object)) : r.rows,
    };
  };
  const db = drizzle({ client: Object.assign(query, { query }) as unknown as NeonQueryFunction<false, false> });
  const cipher = createRawCipher(RAW_KEY);
  const fingerprint = createBusinessFingerprint(RAW_KEY);
  const raw = createFinanceRawRepository(db, cipher);
  const business = createFinanceBusinessRepository(db, raw, cipher, fingerprint);
  const manual = createFinanceManualRepository(db, cipher, fingerprint);
  const classification = createFinanceClassificationRepository(db, business, cipher, manual);
  const schedule = createFinanceScheduleRepository(db, business, classification, cipher, manual);
  const transactions = createFinanceTransactionRepository(db, business, manual, classification, cipher, fingerprint);
  const pdfCipher = createPdfPasswordCipher(PDF_KEYRING, activePdfKeyVersion);
  const pdf = createPdfPasswordRepository(db, pdfCipher);
  return { pg, db, cipher, raw, business, manual, classification, schedule, transactions, pdf };
}

async function copyOwnerRows(source: PGlite, target: PGlite, ownerId: string) {
  await target.transaction(async (tx) => {
    for (const table of [...ownerScopedFinanceTables].reverse()) {
      await tx.query(`delete from ${table} where owner_id = $1`, [ownerId]);
    }
    for (const table of ownerScopedFinanceTables) {
      const { rows } = await source.query(`select * from ${table} where owner_id = $1`, [ownerId]);
      if (rows.length > 0) {
        await tx.query(
          `insert into ${table} select * from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
          [JSON.stringify(rows)],
        );
      }
    }
  });
}

test('isolated synthetic financial restore reapplies deletion exclusions', async (t) => {
  const live = await financeDatabase();
  const isolated = await financeDatabase();
  t.after(() => live.pg.close());
  t.after(() => isolated.pg.close());
  const owner = randomUUID();
  const source = bankSource();
  const saved = await live.raw.import(owner, { batchId: randomUUID(), document: source });
  const detail = await live.business.process(owner, saved.file.id);
  const backup: Record<string, unknown[]> = {};
  for (const table of rawTables) {
    backup[table] = (await live.pg.query(`select * from ${table} where owner_id=$1`, [owner])).rows;
  }
  assert.equal(JSON.stringify(backup).includes('synthetic employer'), false);

  const restore = async (deleted: Set<string>) => {
    if (deleted.has(owner)) return;
    await isolated.pg.transaction(async (tx) => {
      for (const table of rawTables) {
        await tx.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [
          JSON.stringify(backup[table]),
        ]);
      }
    });
  };
  await restore(new Set([owner]));
  assert.equal((await isolated.raw.list(owner)).length, 0);
  await restore(new Set());
  assert.deepEqual(await isolated.raw.find(owner, saved.file.id), await live.raw.find(owner, saved.file.id));
  assert.deepEqual(await isolated.business.find(owner, detail.document.id), detail);

  // Removing an owner's batches and scope cascades through restored Raw/business relationships.
  for (const table of ['finance_raw_batches', 'finance_business_scopes']) {
    await isolated.pg.query(`delete from ${table} where owner_id=$1`, [owner]);
  }
  for (const table of rawTables) {
    assert.equal((await isolated.pg.query(`select * from ${table} where owner_id=$1`, [owner])).rows.length, 0);
  }
  await restore(new Set([owner]));
  assert.equal((await isolated.raw.list(owner)).length, 0);
});

test('selective finance owner restore preserves newer auth, learning and unaffected finance owner state', async (t) => {
  // Simulate 3 separate MSA databases (`innova_auth`, `innova_learning`, `innova_finance`) at live `now`
  // plus an isolated PITR branch of `innova_finance` from timestamp T (< now).
  const liveAuth = await createServicePg('../../auth/drizzle');
  const liveLearning = await createServicePg('../../learning/drizzle');
  const liveFinance = await financeDatabase();
  const pitrFinance = await financeDatabase();
  const isolatedFinance = await financeDatabase();
  t.after(() => liveAuth.close());
  t.after(() => liveLearning.close());
  t.after(() => liveFinance.pg.close());
  t.after(() => pitrFinance.pg.close());
  t.after(() => isolatedFinance.pg.close());

  const victimOwner = randomUUID();
  const revokedOwner = randomUUID();
  const unaffectedOwner = randomUUID();
  const newSignupId = randomUUID();

  // State at PITR timestamp T in finance DB: victimOwner and revokedOwner both had financial records.
  const victimBank = bankSource();
  const pitrFile = await pitrFinance.raw.import(victimOwner, { batchId: randomUUID(), document: victimBank });
  const pitrDetail = await pitrFinance.business.process(victimOwner, pitrFile.file.id);
  const victimManual = manualSaveSchema.parse({
    id: randomUUID(),
    expectedRevision: 0,
    operationId: randomUUID(),
    input: { date: '2026-01-12', type: 'expense', amount: '4500', description: 'synthetic pitr manual' },
  });
  await pitrFinance.manual.save(victimOwner, victimManual);

  const revokedFile = await pitrFinance.raw.import(revokedOwner, { batchId: randomUUID(), document: bankSource() });
  await pitrFinance.business.process(revokedOwner, revokedFile.file.id);

  // Live production state at `now` (> T):
  // - Auth: victimOwner & unaffectedOwner stay approved; revokedOwner was rejected after T; newSignupId signed up after T.
  await liveAuth.query(
    `insert into users (id, email, password_hash, approval_status, role) values
     ($1, 'victim@example.invalid', 'hash', 'approved', 'member'),
     ($2, 'revoked@example.invalid', 'hash', 'rejected', 'member'),
     ($3, 'unaffected@example.invalid', 'hash', 'approved', 'member'),
     ($4, 'newsignup@example.invalid', 'hash', 'pending', 'member')`,
    [victimOwner, revokedOwner, unaffectedOwner, newSignupId],
  );
  // - Learning: newer exam_banks row added after T.
  await liveLearning.query(
    `insert into exam_banks (id, schema, subject, source, generated_at) values ($1, 'v1', 'cloud', 'synthetic', '2026-11-15T00:00:00Z')`,
    ['newer-bank-after-t'],
  );
  // - Finance: victimOwner's data was accidentally lost after T, while unaffectedOwner added a new manual transaction after T.
  const unaffectedManual = manualSaveSchema.parse({
    id: randomUUID(),
    expectedRevision: 0,
    operationId: randomUUID(),
    input: { date: '2026-01-20', type: 'income', amount: '9000', description: 'synthetic newer income' },
  });
  await liveFinance.manual.save(unaffectedOwner, unaffectedManual);

  // Runbook Step 2: Check authoritative approval status from live `innova_auth` before restoring any finance owner.
  const approvedRows = await liveAuth.query<{ id: string }>(
    `select id from users where id = any($1::text[]) and approval_status = 'approved'`,
    [[victimOwner, revokedOwner]],
  );
  const approvedSet = new Set(approvedRows.rows.map((r) => r.id));
  assert.equal(approvedSet.has(victimOwner), true);
  assert.equal(approvedSet.has(revokedOwner), false);

  // Runbook Step 3 & 4: Stage & verify approved victimOwner in isolated DB, then selectively restore only victimOwner into liveFinance.
  for (const candidateOwner of [victimOwner, revokedOwner]) {
    if (!approvedSet.has(candidateOwner)) continue;
    await copyOwnerRows(pitrFinance.pg, isolatedFinance.pg, candidateOwner);
    assert.deepEqual(await isolatedFinance.business.find(candidateOwner, pitrDetail.document.id), pitrDetail);
    await copyOwnerRows(isolatedFinance.pg, liveFinance.pg, candidateOwner);
  }

  // Verify cross-domain & cross-owner isolation:
  assert.deepEqual(await liveFinance.business.find(victimOwner, pitrDetail.document.id), pitrDetail);
  assert.equal((await liveFinance.manual.list(victimOwner)).length, 1);
  assert.equal((await liveFinance.raw.list(revokedOwner)).length, 0);
  const unaffectedRows = await liveFinance.manual.list(unaffectedOwner);
  assert.equal(unaffectedRows.length, 1);
  assert.equal(unaffectedRows[0]!.id, unaffectedManual.id);

  // Auth and Learning newer state remain completely untouched.
  const authAfter = await liveAuth.query<{ id: string; approval_status: string }>(
    `select id, approval_status from users order by id`,
  );
  assert.equal(authAfter.rows.length, 4);
  assert.equal(authAfter.rows.find((r) => r.id === revokedOwner)?.approval_status, 'rejected');
  assert.equal(authAfter.rows.find((r) => r.id === newSignupId)?.approval_status, 'pending');
  const learningAfter = await liveLearning.query<{ id: string }>(`select id from exam_banks`);
  assert.deepEqual(learningAfter.rows, [{ id: 'newer-bank-after-t' }]);
});

test('isolated restore reapplies PIN-69 permanent deletions, strips revision snapshots, and blocks restore when tombstone source is unavailable', async (t) => {
  const pitrFinance = await financeDatabase();
  const liveFinance = await financeDatabase();
  const isolatedFinance = await financeDatabase();
  t.after(() => pitrFinance.pg.close());
  t.after(() => liveFinance.pg.close());
  t.after(() => isolatedFinance.pg.close());

  const owner = randomUUID();
  const card = cardSource();
  const manualId = randomUUID();

  // Seed timestamp T state in pitrFinance, then clone T into liveFinance before simulating post-T deletions.
  const file = await pitrFinance.raw.import(owner, { batchId: randomUUID(), document: card });
  const detail = await pitrFinance.business.process(owner, file.file.id);
  const manualSaved = await pitrFinance.manual.save(
    owner,
    manualSaveSchema.parse({
      id: manualId,
      expectedRevision: 0,
      operationId: randomUUID(),
      input: { date: '2026-01-15', type: 'expense', amount: '2200', description: 'SENSITIVE_MANUAL_DELETE_ME' },
    }),
  );
  const view = await pitrFinance.classification.read(owner);
  const purchase = detail.events.find((e) => e.kind === 'card-purchase')!;
  const purchaseEdit = view.transactions.find((tx) => tx.event.id === purchase.id)!.effective!;
  await pitrFinance.classification.change(owner, {
    expectedRevision: view.revision,
    operationId: randomUUID(),
    change: {
      type: 'edit',
      edit: { ...purchaseEdit, note: 'SENSITIVE_SNAPSHOT_NOTE' },
    },
  });

  await copyOwnerRows(pitrFinance.pg, liveFinance.pg, owner);

  // Verify revision snapshot exists at T in pitrFinance before deletion.
  assert.equal((await pitrFinance.pg.query(`select * from finance_classification_revisions where owner_id = $1`, [owner])).rows.length, 1);

  // Between T and now: owner executes PIN-69 permanent deletion on both file purchase and manual transaction in liveFinance.
  const impactPurchase = await liveFinance.transactions.impact(owner, purchase.id);
  await liveFinance.transactions.remove(owner, {
    id: purchase.id,
    operationId: randomUUID(),
    expectedRevision: impactPurchase.revision,
    confirmed: true,
  });
  const impactManual = await liveFinance.transactions.impact(owner, manualSaved.id);
  await liveFinance.transactions.remove(owner, {
    id: manualSaved.id,
    operationId: randomUUID(),
    expectedRevision: impactManual.revision,
    confirmed: true,
  });

  // Extract authoritative deletion tombstones from liveFinance.
  const authoritativeDeletes = (
    await liveFinance.pg.query<{ event_id: string }>(
      `select event_id from finance_deleted_transactions where owner_id = $1 order by created_at asc`,
      [owner],
    )
  ).rows;
  assert.equal(authoritativeDeletes.length, 2);

  // Stop-gate check: if authoritative tombstone source is unavailable, recovery must abort rather than resurrecting deleted records.
  const runSelectiveRestore = async (options: { authoritativeTombstonesAvailable: boolean }) => {
    if (!options.authoritativeTombstonesAvailable) {
      throw new Error('STOP_GATE: Authoritative finance_deleted_transactions unavailable; aborting restore');
    }
    await copyOwnerRows(pitrFinance.pg, isolatedFinance.pg, owner);
    for (const row of authoritativeDeletes) {
      const stillPresent = await isolatedFinance.transactions.read(owner);
      const existsInIsolated =
        stillPresent.manual.some((m) => m.id === row.event_id) ||
        stillPresent.fileTransactions.some((ft) => ft.id === row.event_id);
      if (existsInIsolated) {
        const impact = await isolatedFinance.transactions.impact(owner, row.event_id);
        await isolatedFinance.transactions.remove(owner, {
          id: row.event_id,
          operationId: randomUUID(),
          expectedRevision: impact.revision,
          confirmed: true,
        });
      }
    }
  };

  await assert.rejects(
    runSelectiveRestore({ authoritativeTombstonesAvailable: false }),
    /STOP_GATE/,
  );

  await runSelectiveRestore({ authoritativeTombstonesAvailable: true });
  await copyOwnerRows(isolatedFinance.pg, liveFinance.pg, owner);

  // Verify deleted items and sensitive snapshots are absent after promotion, while independent card-charge survives.
  const restoredWorkspace = await liveFinance.transactions.read(owner);
  assert.equal(restoredWorkspace.manual.length, 0);
  assert.equal(restoredWorkspace.fileTransactions.some((ft) => ft.id === purchase.id), false);
  assert.equal(restoredWorkspace.fileTransactions.some((ft) => ft.kind === 'card-charge'), true);
  assert.equal(
    (await liveFinance.pg.query(`select * from finance_classification_revisions where owner_id = $1`, [owner])).rows.length,
    0,
  );
  // Re-importing the exact same card file must not resurrect the deleted purchase.
  const reimported = await liveFinance.raw.import(owner, { batchId: randomUUID(), document: card });
  assert.equal(reimported.duplicate, true);
  const reprocessed = await liveFinance.business.process(owner, reimported.file.id);
  assert.equal(reprocessed.events.some((e) => e.id === purchase.id), false);
});

test('isolated restore purges recovered PDF secret attempts and rotates active key version before resuming writes', async (t) => {
  const pitrFinance = await financeDatabase('v1');
  const isolatedFinance = await financeDatabase('v2');
  const liveFinance = await financeDatabase('v2');
  t.after(() => pitrFinance.pg.close());
  t.after(() => isolatedFinance.pg.close());
  t.after(() => liveFinance.pg.close());

  const owner = randomUUID();
  const sessionHash = createHash('sha256').update(owner).digest('hex');
  const ctx: PdfSecretContext = {
    owner,
    sessionHash,
    authTime: Math.floor(Date.now() / 1000),
  };

  // At T: owner stored a PDF password under keyVersion 'v1' and has an unconsumed 'use' attempt.
  const saveAttempt = await pitrFinance.pdf.begin(
    ctx,
    { attemptId: randomUUID(), purpose: 'save', expectedRevision: 0 },
    async () => true,
  );
  await pitrFinance.pdf.save(ctx, { attemptId: saveAttempt.attemptId, expectedRevision: 0 }, 'SYNTHETIC_PDF_SECRET');

  const staleAttempt = await pitrFinance.pdf.begin(
    ctx,
    { attemptId: randomUUID(), purpose: 'use', expectedRevision: 1 },
    async () => true,
  );

  // Stage T state into isolated DB (`v2` active keyring, `v1` retained for decryption).
  await copyOwnerRows(pitrFinance.pg, isolatedFinance.pg, owner);

  // Runbook Step 3: Purge all recovered attempts so stale pre-incident leases cannot replay.
  await isolatedFinance.pg.query(`delete from finance_pdf_secret_attempts where owner_id = $1`, [owner]);
  await assert.rejects(
    isolatedFinance.pdf.reveal(ctx, { attemptId: staleAttempt.attemptId, expectedRevision: 1 }),
  );

  // Promote isolated state to liveFinance (running with activeKeyVersion = 'v2').
  await copyOwnerRows(isolatedFinance.pg, liveFinance.pg, owner);

  // Fresh post-restore attempt can still decrypt 'v1' ciphertext and rotate to 'v2' without nonce reuse.
  const freshReveal = await liveFinance.pdf.begin(
    ctx,
    { attemptId: randomUUID(), purpose: 'use', expectedRevision: 1 },
    async () => true,
  );
  const revealed = await liveFinance.pdf.reveal(ctx, {
    attemptId: freshReveal.attemptId,
    expectedRevision: 1,
  });
  assert.equal(revealed.secret, 'SYNTHETIC_PDF_SECRET');

  const rotateAttempt = await liveFinance.pdf.begin(
    ctx,
    { attemptId: randomUUID(), purpose: 'rotate', expectedRevision: 1 },
    async () => true,
  );
  const rotatedStatus = await liveFinance.pdf.rotate(ctx, {
    attemptId: rotateAttempt.attemptId,
    expectedRevision: 1,
  });
  assert.equal(rotatedStatus.revision, 2);

  const secretRow = (
    await liveFinance.pg.query<{ key_version: string }>(
      `select key_version from finance_pdf_secrets where owner_id = $1`,
      [owner],
    )
  ).rows[0];
  assert.equal(secretRow?.key_version, 'v2');
});
