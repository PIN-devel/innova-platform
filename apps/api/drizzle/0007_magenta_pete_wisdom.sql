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
ALTER TABLE "finance_pdf_secret_attempts" ADD CONSTRAINT "finance_pdf_secret_attempts_owner_id_finance_pdf_secrets_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."finance_pdf_secrets"("owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_pdf_secrets" ADD CONSTRAINT "finance_pdf_secrets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;