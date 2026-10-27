CREATE TABLE "finance_business_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"raw_file_id" text NOT NULL,
	"processor_version" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"scope_keys" jsonb NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_business_documents_owner_raw_unique" UNIQUE("owner_id","raw_file_id","processor_version"),
	CONSTRAINT "finance_business_documents_owner_id_raw_unique" UNIQUE("owner_id","id","raw_file_id"),
	CONSTRAINT "finance_business_documents_state_check" CHECK ("finance_business_documents"."state" in ('accepted','needs-review','invalid')),
	CONSTRAINT "finance_business_documents_kind_check" CHECK ("finance_business_documents"."kind" in ('kb-bank-pdf','kb-card-xlsx'))
);
--> statement-breakpoint
CREATE TABLE "finance_business_events" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"document_id" text NOT NULL,
	"raw_file_id" text NOT NULL,
	"raw_sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"payload_ciphertext" text NOT NULL,
	CONSTRAINT "finance_business_events_kind_check" CHECK ("finance_business_events"."kind" in ('bank-cash','card-purchase','card-charge','card-fee','card-adjustment'))
);
--> statement-breakpoint
CREATE TABLE "finance_business_scopes" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "finance_business_scopes_revision_check" CHECK ("finance_business_scopes"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance_business_documents" ADD CONSTRAINT "finance_business_documents_owner_id_finance_business_scopes_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_business_scopes"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_documents" ADD CONSTRAINT "finance_business_documents_owner_id_raw_file_id_finance_raw_files_owner_id_id_fk" FOREIGN KEY ("owner_id","raw_file_id") REFERENCES "public"."finance_raw_files"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_events" ADD CONSTRAINT "finance_business_events_owner_id_document_id_raw_file_id_finance_business_documents_owner_id_id_raw_file_id_fk" FOREIGN KEY ("owner_id","document_id","raw_file_id") REFERENCES "public"."finance_business_documents"("owner_id","id","raw_file_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_events" ADD CONSTRAINT "finance_business_events_owner_id_raw_file_id_raw_sequence_finance_raw_rows_owner_id_file_id_sequence_fk" FOREIGN KEY ("owner_id","raw_file_id","raw_sequence") REFERENCES "public"."finance_raw_rows"("owner_id","file_id","sequence") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_scopes" ADD CONSTRAINT "finance_business_scopes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;