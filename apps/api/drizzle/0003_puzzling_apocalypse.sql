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
	CONSTRAINT "finance_raw_files_row_count_check" CHECK ("finance_raw_files"."row_count" between 1 and 5000)
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
ALTER TABLE "finance_raw_batches" ADD CONSTRAINT "finance_raw_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_raw_files" ADD CONSTRAINT "finance_raw_files_owner_id_batch_id_finance_raw_batches_owner_id_id_fk" FOREIGN KEY ("owner_id","batch_id") REFERENCES "public"."finance_raw_batches"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_raw_rows" ADD CONSTRAINT "finance_raw_rows_owner_id_file_id_finance_raw_files_owner_id_id_fk" FOREIGN KEY ("owner_id","file_id") REFERENCES "public"."finance_raw_files"("owner_id","id") ON DELETE cascade ON UPDATE no action;