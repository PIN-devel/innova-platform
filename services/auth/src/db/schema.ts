import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ApprovalStatus, UserRole } from "@innova/contracts";
import { sql } from "drizzle-orm";

// The auth service owns only `users`. The same definition is used for the
// legacy monolith database while signup/approval changes are mirrored there.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("pending"),
  role: text("role").$type<UserRole>().notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("users_approval_status_check", sql`${table.approvalStatus} in ('pending', 'approved', 'rejected')`),
  check("users_role_check", sql`${table.role} in ('member', 'admin')`),
]);
