import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { ExamConcept, ExamScenario } from "@innova/contracts";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const examBanks = pgTable("exam_banks", {
  id: text("id").primaryKey(),
  schema: text("schema").notNull(),
  subject: text("subject").notNull(),
  source: text("source").notNull(),
  generatedAt: text("generated_at").notNull(),
  notes: text("notes"),
});

export const examConcepts = pgTable("exam_concepts", {
  bankId: text("bank_id").notNull().references(() => examBanks.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  chapter: integer("chapter").notNull(),
  deck: text("deck").notNull(),
  term: text("term").notNull(),
  content: jsonb("content").$type<ExamConcept>().notNull(),
}, (table) => [primaryKey({ columns: [table.bankId, table.id] })]);

export const examScenarios = pgTable("exam_scenarios", {
  bankId: text("bank_id").notNull().references(() => examBanks.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  chapter: integer("chapter").notNull(),
  content: jsonb("content").$type<ExamScenario>().notNull(),
}, (table) => [primaryKey({ columns: [table.bankId, table.id] })]);
