ALTER TABLE "users" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "approval_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approval_status_check" CHECK ("users"."approval_status" in ('pending', 'approved'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('member', 'admin'));
