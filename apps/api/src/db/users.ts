import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { ApprovalStatus, UserRole } from "@innova/contracts";
import type { createDatabase } from "./client.js";
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
}

export function createUserRepository(db: ReturnType<typeof createDatabase>): UserRepository {
  return {
    async findById(id) {
      const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role }).from(users).where(eq(users.id, id));
      return user;
    },
    async findByEmail(email) {
      const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role }).from(users).where(eq(users.email, email));
      return user;
    },
    async create(email, passwordHash) {
      const [user] = await db.insert(users).values({ id: randomUUID(), email, passwordHash, approvalStatus: "pending", role: "member" })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role });
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
        .set({ approvalStatus: "approved" })
        .where(and(eq(users.id, id), eq(users.approvalStatus, "pending")))
        .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role });
      return user;
    },
    async rejectPending(id) {
      const [user] = await db.update(users)
        .set({ approvalStatus: "rejected" })
        .where(and(eq(users.id, id), eq(users.approvalStatus, "pending")))
        .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash, approvalStatus: users.approvalStatus, role: users.role });
      return user;
    },
  };
}
