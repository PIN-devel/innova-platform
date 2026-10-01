CREATE TABLE "exam_chapters" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_chapters_subject_id_id_pk" PRIMARY KEY("subject_id","id"),
	CONSTRAINT "exam_chapters_order_unique" UNIQUE("subject_id","position"),
	CONSTRAINT "exam_chapters_position_check" CHECK ("exam_chapters"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exam_knowledge_point_sources" (
	"subject_id" text NOT NULL,
	"knowledge_point_id" text NOT NULL,
	"source_block_id" text NOT NULL,
	CONSTRAINT "exam_knowledge_point_sources_subject_id_knowledge_point_id_source_block_id_pk" PRIMARY KEY("subject_id","knowledge_point_id","source_block_id")
);
--> statement-breakpoint
CREATE TABLE "exam_knowledge_points" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"section_id" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_knowledge_points_subject_id_id_pk" PRIMARY KEY("subject_id","id")
);
--> statement-breakpoint
CREATE TABLE "exam_question_knowledge_points" (
	"subject_id" text NOT NULL,
	"question_id" text NOT NULL,
	"knowledge_point_id" text NOT NULL,
	CONSTRAINT "exam_question_knowledge_points_subject_id_question_id_knowledge_point_id_pk" PRIMARY KEY("subject_id","question_id","knowledge_point_id")
);
--> statement-breakpoint
CREATE TABLE "exam_question_sources" (
	"subject_id" text NOT NULL,
	"question_id" text NOT NULL,
	"source_block_id" text NOT NULL,
	CONSTRAINT "exam_question_sources_subject_id_question_id_source_block_id_pk" PRIMARY KEY("subject_id","question_id","source_block_id")
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"section_id" text,
	"position" integer NOT NULL,
	"source_block_id" text NOT NULL,
	"source_revision" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_questions_subject_id_id_pk" PRIMARY KEY("subject_id","id"),
	CONSTRAINT "exam_questions_position_check" CHECK ("exam_questions"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exam_sections" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"parent_section_id" text,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_sections_subject_id_id_pk" PRIMARY KEY("subject_id","id"),
	CONSTRAINT "exam_sections_chapter_id_unique" UNIQUE("subject_id","chapter_id","id"),
	CONSTRAINT "exam_sections_position_check" CHECK ("exam_sections"."position" >= 0),
	CONSTRAINT "exam_sections_self_parent_check" CHECK ("exam_sections"."parent_section_id" is null or "exam_sections"."parent_section_id" <> "exam_sections"."id")
);
--> statement-breakpoint
CREATE TABLE "exam_source_blocks" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"section_id" text NOT NULL,
	"source_document_id" text NOT NULL,
	"position" integer NOT NULL,
	"revision" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_source_blocks_subject_id_id_pk" PRIMARY KEY("subject_id","id"),
	CONSTRAINT "exam_source_blocks_revision_unique" UNIQUE("subject_id","id","revision"),
	CONSTRAINT "exam_source_blocks_order_unique" UNIQUE("subject_id","section_id","position"),
	CONSTRAINT "exam_source_blocks_position_check" CHECK ("exam_source_blocks"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exam_source_documents" (
	"subject_id" text NOT NULL,
	"id" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exam_source_documents_subject_id_id_pk" PRIMARY KEY("subject_id","id")
);
--> statement-breakpoint
CREATE TABLE "exam_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_chapters" ADD CONSTRAINT "exam_chapters_subject_id_exam_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."exam_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_knowledge_point_sources" ADD CONSTRAINT "exam_kp_sources_knowledge_fk" FOREIGN KEY ("subject_id","knowledge_point_id") REFERENCES "public"."exam_knowledge_points"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_knowledge_point_sources" ADD CONSTRAINT "exam_kp_sources_block_fk" FOREIGN KEY ("subject_id","source_block_id") REFERENCES "public"."exam_source_blocks"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_knowledge_points" ADD CONSTRAINT "exam_knowledge_points_section_fk" FOREIGN KEY ("subject_id","section_id") REFERENCES "public"."exam_sections"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_knowledge_points" ADD CONSTRAINT "exam_question_knowledge_question_fk" FOREIGN KEY ("subject_id","question_id") REFERENCES "public"."exam_questions"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_knowledge_points" ADD CONSTRAINT "exam_question_knowledge_point_fk" FOREIGN KEY ("subject_id","knowledge_point_id") REFERENCES "public"."exam_knowledge_points"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_sources" ADD CONSTRAINT "exam_question_sources_question_fk" FOREIGN KEY ("subject_id","question_id") REFERENCES "public"."exam_questions"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_sources" ADD CONSTRAINT "exam_question_sources_block_fk" FOREIGN KEY ("subject_id","source_block_id") REFERENCES "public"."exam_source_blocks"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_chapter_fk" FOREIGN KEY ("subject_id","chapter_id") REFERENCES "public"."exam_chapters"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_section_fk" FOREIGN KEY ("subject_id","chapter_id","section_id") REFERENCES "public"."exam_sections"("subject_id","chapter_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_source_revision_fk" FOREIGN KEY ("subject_id","source_block_id","source_revision") REFERENCES "public"."exam_source_blocks"("subject_id","id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_chapter_fk" FOREIGN KEY ("subject_id","chapter_id") REFERENCES "public"."exam_chapters"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_parent_fk" FOREIGN KEY ("subject_id","chapter_id","parent_section_id") REFERENCES "public"."exam_sections"("subject_id","chapter_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_source_blocks" ADD CONSTRAINT "exam_source_blocks_section_fk" FOREIGN KEY ("subject_id","section_id") REFERENCES "public"."exam_sections"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_source_blocks" ADD CONSTRAINT "exam_source_blocks_document_fk" FOREIGN KEY ("subject_id","source_document_id") REFERENCES "public"."exam_source_documents"("subject_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_source_documents" ADD CONSTRAINT "exam_source_documents_subject_id_exam_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."exam_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_questions_chapter_order_unique" ON "exam_questions" USING btree ("subject_id","chapter_id","position") WHERE "exam_questions"."section_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_questions_section_order_unique" ON "exam_questions" USING btree ("subject_id","section_id","position") WHERE "exam_questions"."section_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sections_root_order_unique" ON "exam_sections" USING btree ("subject_id","chapter_id","position") WHERE "exam_sections"."parent_section_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sections_child_order_unique" ON "exam_sections" USING btree ("subject_id","parent_section_id","position") WHERE "exam_sections"."parent_section_id" is not null;