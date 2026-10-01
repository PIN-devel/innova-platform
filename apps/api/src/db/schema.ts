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
