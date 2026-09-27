CREATE TABLE "exam_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"schema" text NOT NULL,
	"subject" text NOT NULL,
	"source" text NOT NULL,
	"generated_at" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "exam_concepts" (
	"bank_id" text NOT NULL,
	"id" text NOT NULL,
	"chapter" integer NOT NULL,
	"deck" text NOT NULL,
	"term" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_concepts_bank_id_id_pk" PRIMARY KEY("bank_id","id")
);
--> statement-breakpoint
CREATE TABLE "exam_scenarios" (
	"bank_id" text NOT NULL,
	"id" text NOT NULL,
	"chapter" integer NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_scenarios_bank_id_id_pk" PRIMARY KEY("bank_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_approval_status_check" CHECK ("users"."approval_status" in ('pending', 'approved')),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('member', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "exam_concepts" ADD CONSTRAINT "exam_concepts_bank_id_exam_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."exam_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_scenarios" ADD CONSTRAINT "exam_scenarios_bank_id_exam_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."exam_banks"("id") ON DELETE cascade ON UPDATE no action;