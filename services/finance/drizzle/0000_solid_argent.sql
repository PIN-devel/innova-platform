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
	"raw_sequence" integer,
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
CREATE TABLE "finance_classification_revisions" (
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"operation_id" text NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_classification_revisions_owner_id_revision_pk" PRIMARY KEY("owner_id","revision"),
	CONSTRAINT "finance_classification_operation_unique" UNIQUE("owner_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "finance_classification_workspaces" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_classification_revision_check" CHECK ("finance_classification_workspaces"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_deleted_transactions" (
	"owner_id" text NOT NULL,
	"event_id" text NOT NULL,
	"raw_file_id" text,
	"raw_sequence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_deleted_transactions_owner_id_event_id_pk" PRIMARY KEY("owner_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "finance_manual_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_manual_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "finance_manual_revision_check" CHECK ("finance_manual_transactions"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "finance_pdf_secret_attempts" (
	"owner_id" text NOT NULL,
	"id" text NOT NULL,
	"purpose" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"session_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"result_revision" integer,
	CONSTRAINT "finance_pdf_secret_attempts_owner_id_id_pk" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "finance_pdf_attempt_purpose_check" CHECK ("finance_pdf_secret_attempts"."purpose" in ('save','use','delete','rotate'))
);
--> statement-breakpoint
CREATE TABLE "finance_pdf_secret_nonces" (
	"key_version" text NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_pdf_secret_nonces_key_version_nonce_pk" PRIMARY KEY("key_version","nonce")
);
--> statement-breakpoint
CREATE TABLE "finance_pdf_secrets" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"revision" integer NOT NULL,
	"payload_ciphertext" text,
	"key_version" text,
	"nonce" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"rate_started_at" timestamp with time zone NOT NULL,
	"rate_count" integer NOT NULL,
	CONSTRAINT "finance_pdf_revision_check" CHECK ("finance_pdf_secrets"."revision" >= 0),
	CONSTRAINT "finance_pdf_payload_check" CHECK (("finance_pdf_secrets"."payload_ciphertext" is null and "finance_pdf_secrets"."key_version" is null and "finance_pdf_secrets"."nonce" is null) or ("finance_pdf_secrets"."payload_ciphertext" is not null and "finance_pdf_secrets"."key_version" is not null and "finance_pdf_secrets"."nonce" is not null))
);
--> statement-breakpoint
CREATE TABLE "finance_raw_batches" (
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_raw_batches_owner_id_id_pk" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "finance_raw_files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"kind" text NOT NULL,
	"file_hash" text NOT NULL,
	"payload_digest" text NOT NULL,
	"parser_version" text NOT NULL,
	"row_count" integer NOT NULL,
	"metadata_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_raw_files_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "finance_raw_files_document_unique" UNIQUE("owner_id","kind","file_hash"),
	CONSTRAINT "finance_raw_files_kind_check" CHECK ("finance_raw_files"."kind" in ('kb-bank-pdf', 'kb-card-xlsx')),
	CONSTRAINT "finance_raw_files_row_count_check" CHECK ("finance_raw_files"."row_count" between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "finance_raw_rows" (
	"owner_id" text NOT NULL,
	"file_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"payload_ciphertext" text NOT NULL,
	CONSTRAINT "finance_raw_rows_owner_id_file_id_sequence_pk" PRIMARY KEY("owner_id","file_id","sequence"),
	CONSTRAINT "finance_raw_rows_sequence_check" CHECK ("finance_raw_rows"."sequence" between 1 and 5000)
);
--> statement-breakpoint
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
CREATE TABLE "finance_transaction_operations" (
	"owner_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_transaction_operations_owner_id_operation_id_pk" PRIMARY KEY("owner_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "finance_business_documents" ADD CONSTRAINT "finance_business_documents_owner_id_finance_business_scopes_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_business_scopes"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_documents" ADD CONSTRAINT "finance_business_documents_owner_id_raw_file_id_finance_raw_files_owner_id_id_fk" FOREIGN KEY ("owner_id","raw_file_id") REFERENCES "public"."finance_raw_files"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_events" ADD CONSTRAINT "finance_business_events_owner_id_document_id_raw_file_id_finance_business_documents_owner_id_id_raw_file_id_fk" FOREIGN KEY ("owner_id","document_id","raw_file_id") REFERENCES "public"."finance_business_documents"("owner_id","id","raw_file_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_business_events" ADD CONSTRAINT "finance_business_events_owner_id_raw_file_id_raw_sequence_finance_raw_rows_owner_id_file_id_sequence_fk" FOREIGN KEY ("owner_id","raw_file_id","raw_sequence") REFERENCES "public"."finance_raw_rows"("owner_id","file_id","sequence") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_classification_revisions" ADD CONSTRAINT "finance_classification_revisions_owner_id_finance_classification_workspaces_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_classification_workspaces"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_pdf_secret_attempts" ADD CONSTRAINT "finance_pdf_secret_attempts_owner_id_finance_pdf_secrets_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_pdf_secrets"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_raw_files" ADD CONSTRAINT "finance_raw_files_owner_id_batch_id_finance_raw_batches_owner_id_id_fk" FOREIGN KEY ("owner_id","batch_id") REFERENCES "public"."finance_raw_batches"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_raw_rows" ADD CONSTRAINT "finance_raw_rows_owner_id_file_id_finance_raw_files_owner_id_id_fk" FOREIGN KEY ("owner_id","file_id") REFERENCES "public"."finance_raw_files"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_schedule_revisions" ADD CONSTRAINT "finance_schedule_revisions_owner_id_finance_schedule_workspaces_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_schedule_workspaces"("owner_id") ON DELETE cascade ON UPDATE no action;