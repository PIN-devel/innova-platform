import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { ApprovalStatus, UserRole } from "@innova/contracts";
import type { Database } from "./client.js";
import { users } from "./schema.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  approvalStatus: ApprovalStatus;
  role: UserRole;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | undefined>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  create(email: string, passwordHash: string): Promise<UserRecord | undefined>;
  findPending(): Promise<Array<Pick<UserRecord, "id" | "email" | "approvalStatus">>>;
  approvePending(id: string): Promise<UserRecord | undefined>;
  rejectPending(id: string): Promise<UserRecord | undefined>;
  syncLegacyApproval?(id: string): Promise<void>;
}

export interface LegacySyncLogger {
  error(object: Record<string, unknown>, message: string): void;
  warn(object: Record<string, unknown>, message: string): void;
}

const columns = { id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role };

/**
 * `db` (innova_auth) is the source of truth. When `legacyDb` is provided, each
 * successful write is mirrored to the monolith `users` table so the Render API
 * (Exam/Curriculum guards, Finance `FOR SHARE` actor locks) sees the same user.
 * A mirror failure never fails the request; it is logged as
 * `auth.legacy_sync.failed` so an operator can reconcile it.
 */
export function createUserRepository(db: Database, options: { legacyDb?: Database; logger?: LegacySyncLogger } = {}): UserRepository {
  const { legacyDb, logger } = options;

  async function mirror(operation: "create" | "approve" | "reject", user: UserRecord, write: (legacy: Database) => Promise<number>) {
    if (!legacyDb) return;
    try {
      const affected = await write(legacyDb);
      if (affected === 0) logger?.warn({ event: "auth.legacy_sync.skipped", operation, userId: user.id }, "legacy users mirror changed no rows");
    } catch (error) {
      logger?.error({ event: "auth.legacy_sync.failed", operation, userId: user.id, err: error }, "legacy users mirror failed");
    }
  }

  return {
    async findById(id) {
      const [user] = await db.select(columns).from(users).where(eq(users.id, id));
      return user;
    },
    async findByEmail(email) {
      const [user] = await db.select(columns).from(users).where(eq(users.email, email));
      return user;
    },
    async create(email, passwordHash) {
      const [user] = await db.insert(users).values({ id: randomUUID(), email, passwordHash, approvalStatus: "pending", role: "member" })
        .onConflictDoNothing({ target: users.email })
        .returning(columns);
      if (user) {
        await mirror("create", user, async (legacy) => (await legacy.insert(users).values(user).onConflictDoNothing().returning({ id: users.id })).length);
      }
      return user;
    },
    async findPending() {
      return db.select({ id: users.id, email: users.email, approvalStatus: users.approvalStatus })
        .from(users)
        .where(eq(users.approvalStatus, "pending"))
        .orderBy(asc(users.createdAt));
    },
    async approvePending(id) {
      const [user] = await db.update(users)
        .set({ approvalStatus: "approved", updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.approvalStatus, "pending")))
        .returning(columns);
      if (user) {
        await mirror("approve", user, async (legacy) => (await legacy.update(users).set({ approvalStatus: "approved", updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id })).length);
      }
      return user;
    },
    async rejectPending(id) {
      const [user] = await db.update(users)
        .set({ approvalStatus: "rejected", updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.approvalStatus, "pending")))
        .returning(columns);
      if (user) {
        await mirror("reject", user, async (legacy) => (await legacy.update(users).set({ approvalStatus: "rejected", updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id })).length);
      }
      return user;
    },
    async syncLegacyApproval(id) {
      const user = await db.select(columns).from(users).where(eq(users.id, id)).then(([u]) => u);
      if (user && user.approvalStatus === "approved") {
        await mirror("approve", user, async (legacy) => (await legacy.update(users).set({ approvalStatus: "approved", updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id })).length);
      }
    },
  };
}
