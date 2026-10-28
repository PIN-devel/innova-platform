CREATE TABLE "finance_schedule_revisions" (
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"operation_id" text NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_schedule_revisions_owner_id_revision_pk" PRIMARY KEY("owner_id","revision"),
	CONSTRAINT "finance_schedule_operation_unique" UNIQUE("owner_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "finance_schedule_workspaces" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_schedule_revision_check" CHECK ("finance_schedule_workspaces"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance_schedule_revisions" ADD CONSTRAINT "finance_schedule_revisions_owner_id_finance_schedule_workspaces_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_schedule_workspaces"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_schedule_workspaces" ADD CONSTRAINT "finance_schedule_workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;