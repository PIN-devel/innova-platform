import { drizzle } from "drizzle-orm/neon-http";

export function createDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return drizzle(url);
}
