import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { createUserRepository } from "../src/db/users.js";

async function createPgInstance() {
  const pg = new PGlite();
  const ddl = await readFile(new URL("../drizzle/0000_narrow_expediter.sql", import.meta.url), "utf8");
  await pg.exec(ddl);

  const query = async (sql: string, params: unknown[], options?: { arrayMode?: boolean }) => {
    const result = await pg.query(sql, params);
    return {
      ...result,
      rowCount: result.affectedRows ?? result.rows.length,
      rows: options?.arrayMode ? result.rows.map((r) => Object.values(r as object)) : result.rows,
    };
  };
  const client = Object.assign(query, { query }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle({ client });
  return { pg, db };
}

test("users repository mirrors create, approve, and reject to legacy database", async (t) => {
  const primary = await createPgInstance();
  const legacy = await createPgInstance();
  t.after(async () => {
    await primary.pg.close();
    await legacy.pg.close();
  });

  const repo = createUserRepository(primary.db, { legacyDb: legacy.db });

  // 1. Create
  const created = await repo.create("user@example.com", "hash123");
  assert.ok(created);
  assert.equal(created.email, "user@example.com");
  assert.equal(created.approvalStatus, "pending");

  // Verify primary
  const primaryRows = (await primary.pg.query<{ id: string; email: string; approval_status: string }>("SELECT id, email, approval_status FROM users")).rows;
  assert.equal(primaryRows.length, 1);
  assert.equal(primaryRows[0]?.id, created.id);
  assert.equal(primaryRows[0]?.approval_status, "pending");

  // Verify legacy mirror
  const legacyRows = (await legacy.pg.query<{ id: string; email: string; approval_status: string }>("SELECT id, email, approval_status FROM users")).rows;
  assert.equal(legacyRows.length, 1);
  assert.equal(legacyRows[0]?.id, created.id);
  assert.equal(legacyRows[0]?.email, "user@example.com");
  assert.equal(legacyRows[0]?.approval_status, "pending");

  // 2. Approve
  const approved = await repo.approvePending(created.id);
  assert.ok(approved);
  assert.equal(approved.approvalStatus, "approved");

  const primaryApproved = (await primary.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [created.id])).rows[0];
  const legacyApproved = (await legacy.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [created.id])).rows[0];
  assert.equal(primaryApproved?.approval_status, "approved");
  assert.equal(legacyApproved?.approval_status, "approved");

  // 3. Reject a new pending user
  const user2 = await repo.create("user2@example.com", "hash456");
  assert.ok(user2);
  const rejected = await repo.rejectPending(user2.id);
  assert.ok(rejected);
  assert.equal(rejected.approvalStatus, "rejected");

  const primaryRejected = (await primary.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [user2.id])).rows[0];
  const legacyRejected = (await legacy.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [user2.id])).rows[0];
  assert.equal(primaryRejected?.approval_status, "rejected");
  assert.equal(legacyRejected?.approval_status, "rejected");
});

test("legacy mirror failure does not break primary operations and logs error", async (t) => {
  const primary = await createPgInstance();
  t.after(async () => {
    await primary.pg.close();
  });

  // A broken legacy db client that always rejects queries
  const failingClient = (async () => {
    throw new Error("simulated legacy db network partition");
  }) as unknown as NeonQueryFunction<false, false>;
  const failingLegacyDb = drizzle({ client: failingClient });

  const errors: Array<{ event: string; operation: string; userId: string }> = [];
  const logger = {
    error(obj: Record<string, unknown>) {
      errors.push(obj as { event: string; operation: string; userId: string });
    },
    warn() {},
  };

  const repo = createUserRepository(primary.db, { legacyDb: failingLegacyDb, logger });

  // Create must still succeed on primary
  const created = await repo.create("resilient@example.com", "hash789");
  assert.ok(created);
  assert.equal(created.email, "resilient@example.com");

  // Primary must have the row
  const primaryRows = (await primary.pg.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE id = $1", [created.id])).rows;
  assert.equal(primaryRows.length, 1);

  // An error log was emitted
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.event, "auth.legacy_sync.failed");
  assert.equal(errors[0]?.operation, "create");
  assert.equal(errors[0]?.userId, created.id);
});

test("syncLegacyApproval synchronizes legacy DB when called idempotently", async (t) => {
  const primary = await createPgInstance();
  const legacy = await createPgInstance();
  t.after(async () => {
    await primary.pg.close();
    await legacy.pg.close();
  });

  const repo = createUserRepository(primary.db, { legacyDb: legacy.db });
  const created = await repo.create("retry@example.com", "hash999");
  assert.ok(created);

  // Primary was approved (e.g. earlier attempt), but legacy remained pending
  await primary.pg.query("UPDATE users SET approval_status = 'approved' WHERE id = $1", [created.id]);
  let legacyStatus = (await legacy.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [created.id])).rows[0]?.approval_status;
  assert.equal(legacyStatus, "pending");

  // Trigger syncLegacyApproval (as admin-users POST /users/:id/approve does on retry)
  await repo.syncLegacyApproval?.(created.id);

  legacyStatus = (await legacy.pg.query<{ approval_status: string }>("SELECT approval_status FROM users WHERE id = $1", [created.id])).rows[0]?.approval_status;
  assert.equal(legacyStatus, "approved");
});
