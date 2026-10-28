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
CREATE TABLE "finance_transaction_operations" (
	"owner_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_transaction_operations_owner_id_operation_id_pk" PRIMARY KEY("owner_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "finance_raw_files" DROP CONSTRAINT "finance_raw_files_row_count_check";--> statement-breakpoint
ALTER TABLE "finance_business_events" ALTER COLUMN "raw_sequence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_deleted_transactions" ADD CONSTRAINT "finance_deleted_transactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_manual_transactions" ADD CONSTRAINT "finance_manual_transactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_operations" ADD CONSTRAINT "finance_transaction_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_raw_files" ADD CONSTRAINT "finance_raw_files_row_count_check" CHECK ("finance_raw_files"."row_count" between 0 and 5000);