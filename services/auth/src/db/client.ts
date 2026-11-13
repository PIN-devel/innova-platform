import { drizzle } from "drizzle-orm/neon-http";

export type Database = ReturnType<typeof drizzle>;

export function createDatabase(url = process.env.DATABASE_URL): Database {
  if (!url) throw new Error("DATABASE_URL is required");
  return drizzle(url);
}
