import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import type { ApprovalStatus, UserRole, ExamConcept, ExamScenario, CurriculumSubject, CurriculumSourceDocument, CurriculumChapter, CurriculumSection, CurriculumSourceBlock, CurriculumKnowledgePoint, CurriculumQuestion } from "@innova/contracts";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("pending"),
  role: text("role").$type<UserRole>().notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("users_approval_status_check", sql`${table.approvalStatus} in ('pending', 'approved', 'rejected')`),
  check("users_role_check", sql`${table.role} in ('member', 'admin')`),
]);

export const examBanks = pgTable("exam_banks", {
  id: text("id").primaryKey(),
  schema: text("schema").notNull(),
  subject: text("subject").notNull(),
  source: text("source").notNull(),
  generatedAt: text("generated_at").notNull(),
  notes: text("notes"),
});

export const examConcepts = pgTable("exam_concepts", {
  bankId: text("bank_id").notNull().references(() => examBanks.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  chapter: integer("chapter").notNull(),
  deck: text("deck").notNull(),
  term: text("term").notNull(),
  content: jsonb("content").$type<ExamConcept>().notNull(),
}, (table) => [primaryKey({ columns: [table.bankId, table.id] })]);

export const examScenarios = pgTable("exam_scenarios", {
  bankId: text("bank_id").notNull().references(() => examBanks.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  chapter: integer("chapter").notNull(),
  content: jsonb("content").$type<ExamScenario>().notNull(),
}, (table) => [primaryKey({ columns: [table.bankId, table.id] })]);

// Curriculum coexists with ExamBank. Composite keys scope every relationship
// to one Subject, including source and assessment junctions.
export const curriculumSubjects = pgTable("exam_subjects", {
  id: text("id").primaryKey(),
  content: jsonb("content").$type<CurriculumSubject>().notNull(),
});

export const curriculumSourceDocuments = pgTable("exam_source_documents", {
  subjectId: text("subject_id").notNull().references(() => curriculumSubjects.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  content: jsonb("content").$type<CurriculumSourceDocument>().notNull(),
}, (t) => [primaryKey({ columns: [t.subjectId, t.id] })]);

export const curriculumChapters = pgTable("exam_chapters", {
  subjectId: text("subject_id").notNull().references(() => curriculumSubjects.id, { onDelete: "cascade" }),
  id: text("id").notNull(), position: integer("position").notNull(),
  content: jsonb("content").$type<CurriculumChapter>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.id] }),
  unique("exam_chapters_order_unique").on(t.subjectId, t.position),
  check("exam_chapters_position_check", sql`${t.position} >= 0`),
]);

export const curriculumSections = pgTable("exam_sections", {
  subjectId: text("subject_id").notNull(), id: text("id").notNull(),
  chapterId: text("chapter_id").notNull(), parentSectionId: text("parent_section_id"),
  position: integer("position").notNull(),
  content: jsonb("content").$type<CurriculumSection>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.id] }),
  unique("exam_sections_chapter_id_unique").on(t.subjectId, t.chapterId, t.id),
  foreignKey({ columns: [t.subjectId, t.chapterId], foreignColumns: [curriculumChapters.subjectId, curriculumChapters.id], name: "exam_sections_chapter_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.chapterId, t.parentSectionId], foreignColumns: [t.subjectId, t.chapterId, t.id], name: "exam_sections_parent_fk" }).onDelete("cascade"),
  uniqueIndex("exam_sections_root_order_unique").on(t.subjectId, t.chapterId, t.position).where(sql`${t.parentSectionId} is null`),
  uniqueIndex("exam_sections_child_order_unique").on(t.subjectId, t.parentSectionId, t.position).where(sql`${t.parentSectionId} is not null`),
  check("exam_sections_position_check", sql`${t.position} >= 0`),
  check("exam_sections_self_parent_check", sql`${t.parentSectionId} is null or ${t.parentSectionId} <> ${t.id}`),
]);

export const curriculumSourceBlocks = pgTable("exam_source_blocks", {
  subjectId: text("subject_id").notNull(), id: text("id").notNull(),
  sectionId: text("section_id").notNull(), sourceDocumentId: text("source_document_id").notNull(),
  position: integer("position").notNull(), revision: text("revision").notNull(),
  content: jsonb("content").$type<CurriculumSourceBlock>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.id] }),
  unique("exam_source_blocks_revision_unique").on(t.subjectId, t.id, t.revision),
  unique("exam_source_blocks_order_unique").on(t.subjectId, t.sectionId, t.position),
  foreignKey({ columns: [t.subjectId, t.sectionId], foreignColumns: [curriculumSections.subjectId, curriculumSections.id], name: "exam_source_blocks_section_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.sourceDocumentId], foreignColumns: [curriculumSourceDocuments.subjectId, curriculumSourceDocuments.id], name: "exam_source_blocks_document_fk" }).onDelete("cascade"),
  check("exam_source_blocks_position_check", sql`${t.position} >= 0`),
]);

export const curriculumKnowledgePoints = pgTable("exam_knowledge_points", {
  subjectId: text("subject_id").notNull(), id: text("id").notNull(), sectionId: text("section_id").notNull(),
  content: jsonb("content").$type<CurriculumKnowledgePoint>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.id] }),
  foreignKey({ columns: [t.subjectId, t.sectionId], foreignColumns: [curriculumSections.subjectId, curriculumSections.id], name: "exam_knowledge_points_section_fk" }).onDelete("cascade"),
]);

export const curriculumQuestions = pgTable("exam_questions", {
  subjectId: text("subject_id").notNull(), id: text("id").notNull(), chapterId: text("chapter_id").notNull(), sectionId: text("section_id"),
  position: integer("position").notNull(), sourceBlockId: text("source_block_id").notNull(), sourceRevision: text("source_revision").notNull(),
  content: jsonb("content").$type<CurriculumQuestion>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.id] }),
  foreignKey({ columns: [t.subjectId, t.chapterId], foreignColumns: [curriculumChapters.subjectId, curriculumChapters.id], name: "exam_questions_chapter_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.chapterId, t.sectionId], foreignColumns: [curriculumSections.subjectId, curriculumSections.chapterId, curriculumSections.id], name: "exam_questions_section_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.sourceBlockId, t.sourceRevision], foreignColumns: [curriculumSourceBlocks.subjectId, curriculumSourceBlocks.id, curriculumSourceBlocks.revision], name: "exam_questions_source_revision_fk" }).onDelete("cascade"),
  uniqueIndex("exam_questions_chapter_order_unique").on(t.subjectId, t.chapterId, t.position).where(sql`${t.sectionId} is null`),
  uniqueIndex("exam_questions_section_order_unique").on(t.subjectId, t.sectionId, t.position).where(sql`${t.sectionId} is not null`),
  check("exam_questions_position_check", sql`${t.position} >= 0`),
]);

export const curriculumKnowledgePointSources = pgTable("exam_knowledge_point_sources", {
  subjectId: text("subject_id").notNull(), knowledgePointId: text("knowledge_point_id").notNull(), sourceBlockId: text("source_block_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.knowledgePointId, t.sourceBlockId] }),
  foreignKey({ columns: [t.subjectId, t.knowledgePointId], foreignColumns: [curriculumKnowledgePoints.subjectId, curriculumKnowledgePoints.id], name: "exam_kp_sources_knowledge_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.sourceBlockId], foreignColumns: [curriculumSourceBlocks.subjectId, curriculumSourceBlocks.id], name: "exam_kp_sources_block_fk" }).onDelete("cascade"),
]);

export const curriculumQuestionSources = pgTable("exam_question_sources", {
  subjectId: text("subject_id").notNull(), questionId: text("question_id").notNull(), sourceBlockId: text("source_block_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.questionId, t.sourceBlockId] }),
  foreignKey({ columns: [t.subjectId, t.questionId], foreignColumns: [curriculumQuestions.subjectId, curriculumQuestions.id], name: "exam_question_sources_question_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.sourceBlockId], foreignColumns: [curriculumSourceBlocks.subjectId, curriculumSourceBlocks.id], name: "exam_question_sources_block_fk" }).onDelete("cascade"),
]);

export const curriculumQuestionKnowledgePoints = pgTable("exam_question_knowledge_points", {
  subjectId: text("subject_id").notNull(), questionId: text("question_id").notNull(), knowledgePointId: text("knowledge_point_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.questionId, t.knowledgePointId] }),
  foreignKey({ columns: [t.subjectId, t.questionId], foreignColumns: [curriculumQuestions.subjectId, curriculumQuestions.id], name: "exam_question_knowledge_question_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.subjectId, t.knowledgePointId], foreignColumns: [curriculumKnowledgePoints.subjectId, curriculumKnowledgePoints.id], name: "exam_question_knowledge_point_fk" }).onDelete("cascade"),
]);

// Immutable ingestion records. No business interpretation or mutable audit fields.
export const financeRawBatches = pgTable("finance_raw_batches", {
  id: text("id").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.id] })]);

export const financeRawFiles = pgTable("finance_raw_files", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), batchId: text("batch_id").notNull(),
  kind: text("kind").notNull(), fileHash: text("file_hash").notNull(), payloadDigest: text("payload_digest").notNull(),
  parserVersion: text("parser_version").notNull(), rowCount: integer("row_count").notNull(),
  metadataCiphertext: text("metadata_ciphertext").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("finance_raw_files_owner_id_unique").on(t.ownerId, t.id),
  unique("finance_raw_files_document_unique").on(t.ownerId, t.kind, t.fileHash),
  foreignKey({ columns: [t.ownerId, t.batchId], foreignColumns: [financeRawBatches.ownerId, financeRawBatches.id] }).onDelete("cascade"),
  check("finance_raw_files_kind_check", sql`${t.kind} in ('kb-bank-pdf', 'kb-card-xlsx')`),
  check("finance_raw_files_row_count_check", sql`${t.rowCount} between 0 and 5000`),
]);

export const financeRawRows = pgTable("finance_raw_rows", {
  ownerId: text("owner_id").notNull(), fileId: text("file_id").notNull(),
  sequence: integer("sequence").notNull(), payloadCiphertext: text("payload_ciphertext").notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.fileId, t.sequence] }),
  foreignKey({ columns: [t.ownerId, t.fileId], foreignColumns: [financeRawFiles.ownerId, financeRawFiles.id] }).onDelete("cascade"),
  check("finance_raw_rows_sequence_check", sql`${t.sequence} between 1 and 5000`),
]);

// The revision serializes per-owner interpretation decisions across different files.
export const financeBusinessScopes = pgTable('finance_business_scopes', {
  ownerId: text('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
}, t => [check('finance_business_scopes_revision_check', sql`${t.revision} > 0`)]);
export const financeBusinessDocuments = pgTable('finance_business_documents', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => financeBusinessScopes.ownerId, { onDelete: 'cascade' }),
  rawFileId: text('raw_file_id').notNull(), processorVersion: text('processor_version').notNull(),
  kind: text('kind').notNull(), state: text('state').notNull(), scopeKeys: jsonb('scope_keys').$type<string[]>().notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique('finance_business_documents_owner_raw_unique').on(t.ownerId,t.rawFileId,t.processorVersion),
  unique('finance_business_documents_owner_id_raw_unique').on(t.ownerId,t.id,t.rawFileId),
  foreignKey({ columns: [t.ownerId,t.rawFileId], foreignColumns: [financeRawFiles.ownerId,financeRawFiles.id] }).onDelete('cascade'),
  check('finance_business_documents_state_check', sql`${t.state} in ('accepted','needs-review','invalid')`),
  check('finance_business_documents_kind_check', sql`${t.kind} in ('kb-bank-pdf','kb-card-xlsx')`),
]);
export const financeBusinessEvents = pgTable('finance_business_events', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), documentId: text('document_id').notNull(),
  rawFileId: text('raw_file_id').notNull(), rawSequence: integer('raw_sequence'), kind: text('kind').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(),
}, t => [
  foreignKey({ columns: [t.ownerId,t.documentId,t.rawFileId], foreignColumns: [financeBusinessDocuments.ownerId,financeBusinessDocuments.id,financeBusinessDocuments.rawFileId] }).onDelete('cascade'),
  foreignKey({ columns: [t.ownerId,t.rawFileId,t.rawSequence], foreignColumns: [financeRawRows.ownerId,financeRawRows.fileId,financeRawRows.sequence] }).onDelete('cascade'),
  check('finance_business_events_kind_check', sql`${t.kind} in ('bank-cash','card-purchase','card-charge','card-fee','card-adjustment')`),
]);

// Current user classification and immutable command snapshots. Actor is owner;
// encrypted payloads reference validated, immutable business event IDs.
export const financeClassificationWorkspaces = pgTable('finance_classification_workspaces', {
  ownerId: text('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, t => [check('finance_classification_revision_check', sql`${t.revision} > 0`)]);
export const financeClassificationRevisions = pgTable('finance_classification_revisions', {
  ownerId: text('owner_id').notNull().references(() => financeClassificationWorkspaces.ownerId, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  operationId: text('operation_id').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.ownerId, t.revision] }), unique('finance_classification_operation_unique').on(t.ownerId, t.operationId)]);

export const financeScheduleWorkspaces = pgTable('finance_schedule_workspaces', {
  ownerId: text('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), payloadCiphertext: text('payload_ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, t => [check('finance_schedule_revision_check', sql`${t.revision} > 0`)]);
export const financeScheduleRevisions = pgTable('finance_schedule_revisions', {
  ownerId: text('owner_id').notNull().references(() => financeScheduleWorkspaces.ownerId, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), operationId: text('operation_id').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.ownerId, t.revision] }), unique('finance_schedule_operation_unique').on(t.ownerId, t.operationId)]);

export const financePdfSecrets = pgTable('finance_pdf_secrets', {
  ownerId: text('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').notNull(), revision: integer('revision').notNull(),
  payloadCiphertext: text('payload_ciphertext'), keyVersion: text('key_version'), nonce: text('nonce'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  rateStartedAt: timestamp('rate_started_at', { withTimezone: true }).notNull(), rateCount: integer('rate_count').notNull(),
}, t => [check('finance_pdf_revision_check', sql`${t.revision} >= 0`),check('finance_pdf_payload_check',sql`(${t.payloadCiphertext} is null and ${t.keyVersion} is null and ${t.nonce} is null) or (${t.payloadCiphertext} is not null and ${t.keyVersion} is not null and ${t.nonce} is not null)`)]);
export const financePdfSecretAttempts = pgTable('finance_pdf_secret_attempts', {
  ownerId: text('owner_id').notNull().references(() => financePdfSecrets.ownerId, { onDelete: 'cascade' }), id: text('id').notNull(),
  purpose: text('purpose').notNull(), expectedRevision: integer('expected_revision').notNull(), sessionHash: text('session_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  reauthenticatedAt: timestamp('reauthenticated_at', { withTimezone: true }), consumedAt: timestamp('consumed_at', { withTimezone: true }), resultRevision: integer('result_revision'),
}, t => [primaryKey({columns:[t.ownerId,t.id]}),check('finance_pdf_attempt_purpose_check',sql`${t.purpose} in ('save','use','delete','rotate')`)]);
// Nonpersonal nonce reservations survive account deletion until the key version is retired.
export const financePdfSecretNonces = pgTable('finance_pdf_secret_nonces', {
  keyVersion: text('key_version').notNull(), nonce: text('nonce').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, t => [primaryKey({columns:[t.keyVersion,t.nonce]})]);

// Manual records have their own identity and never fabricate a source file.
export const financeManualTransactions = pgTable('finance_manual_transactions', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id, {onDelete:'cascade'}),
  revision: integer('revision').notNull(), payloadCiphertext:text('payload_ciphertext').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
}, t=>[unique('finance_manual_owner_id_unique').on(t.ownerId,t.id),check('finance_manual_revision_check',sql`${t.revision}>0`)]);
// Contains no amounts, descriptions or command snapshots. Entries outlive record removal.
export const financeTransactionOperations = pgTable('finance_transaction_operations', {
 ownerId:text('owner_id').notNull().references(()=>users.id,{onDelete:'cascade'}),operationId:text('operation_id').notNull(),transactionId:text('transaction_id').notNull(),digest:text('digest').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.operationId]})]);
export const financeDeletedTransactions = pgTable('finance_deleted_transactions', {
 ownerId:text('owner_id').notNull().references(()=>users.id,{onDelete:'cascade'}),eventId:text('event_id').notNull(),rawFileId:text('raw_file_id'),rawSequence:integer('raw_sequence'),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.eventId]})]);
