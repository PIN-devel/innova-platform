import assert from "node:assert/strict";
import { test } from "node:test";
import type { createDatabase } from "../src/db/client.js";
import { createUserRepository } from "../src/db/users.js";

test("user repository creates and returns a pending member", async () => {
  let inserted: Record<string, unknown> | undefined;
  let updateValues: Record<string, unknown> | undefined;
  let updateCondition: unknown;
  const database = {
    insert() {
      return {
        values(values: Record<string, unknown>) {
          inserted = values;
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  return inserted ? [inserted] : [];
                },
              };
            },
          };
        },
      };
    },
    select(selection: Record<string, unknown>) {
      const rows = inserted && ("passwordHash" in selection || inserted.approvalStatus === "pending")
        ? [Object.fromEntries(Object.keys(selection).map((key) => [key, inserted?.[key]]))]
        : [];
      const query = {
        orderBy: async () => rows,
        then: (resolve: (value: Record<string, unknown>[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      };
      return {
        from() {
          return {
            where() { return query; },
          };
        },
      };
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          updateValues = values;
          return {
            where(condition: unknown) {
              updateCondition = condition;
              return {
                async returning() {
                  if (!inserted || inserted.approvalStatus !== "pending") return [];
                  inserted = { ...inserted, ...updateValues };
                  return [inserted];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as ReturnType<typeof createDatabase>;

  const users = createUserRepository(database);
  const created = await users.create("new@example.com", "password-hash");

  assert.equal(created?.approvalStatus, "pending");
  assert.equal(created?.role, "member");
  assert.equal(inserted?.approvalStatus, "pending");
  assert.equal(inserted?.role, "member");
  assert.deepEqual(await users.findPending(), [{ id: created?.id, email: created?.email, approvalStatus: "pending" }]);
  assert.deepEqual(await users.findById(created!.id), created);
  assert.deepEqual(await users.findByEmail(created!.email), created);

  const approved = await users.approvePending(created!.id);
  assert.equal(approved?.approvalStatus, "approved");
  assert.equal(approved?.role, "member");
  assert.ok(updateCondition);
  assert.deepEqual(updateValues, { approvalStatus: "approved" });
  assert.equal(await users.approvePending(created!.id), undefined);
});
