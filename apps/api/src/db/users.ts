import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { createDatabase } from "./client.js";
import { users } from "./schema.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | undefined>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  create(email: string, passwordHash: string): Promise<UserRecord | undefined>;
}

export function createUserRepository(db: ReturnType<typeof createDatabase>): UserRepository {
  return {
    async findById(id) {
      const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, id));
      return user;
    },
    async findByEmail(email) {
      const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email));
      return user;
    },
    async create(email, passwordHash) {
      const [user] = await db.insert(users).values({ id: randomUUID(), email, passwordHash })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash });
      return user;
    },
  };
}
