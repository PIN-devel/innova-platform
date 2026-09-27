import { randomUUID } from "node:crypto";
import type { Item } from "@innova/contracts";
import { eq } from "drizzle-orm";
import type { createDatabase } from "./client.js";
import { items } from "./schema.js";

export interface ItemRepository {
  list(): Promise<Item[]>;
  find(id: string): Promise<Item | undefined>;
  create(name: string): Promise<Item>;
  update(id: string, name: string): Promise<Item | undefined>;
  remove(id: string): Promise<boolean>;
}

export function createItemRepository(db: ReturnType<typeof createDatabase>): ItemRepository {
  return {
    list: () => db.select().from(items),
    async find(id) {
      const [item] = await db.select().from(items).where(eq(items.id, id));
      return item;
    },
    async create(name) {
      const [item] = await db.insert(items).values({ id: randomUUID(), name }).returning();
      return item;
    },
    async update(id, name) {
      const [item] = await db.update(items).set({ name }).where(eq(items.id, id)).returning();
      return item;
    },
    async remove(id) {
      const deleted = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
      return deleted.length > 0;
    },
  };
}
