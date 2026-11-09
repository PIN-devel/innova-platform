CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_approval_status_check" CHECK ("users"."approval_status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('member', 'admin'))
);
