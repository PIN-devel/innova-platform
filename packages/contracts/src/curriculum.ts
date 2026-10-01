import { z } from "zod";

// IDs are assigned once by normalization, never derived from array positions.
// Entity IDs are local to a Subject; references resolve only inside its bundle.
export const CurriculumIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const nonempty = z.string().min(1);
const position = z.number().int().nonnegative();
const references = z.array(CurriculumIdSchema).refine((ids) => new Set(ids).size === ids.length, "Duplicate reference");
const evidence = references.min(1);
const privateAsset = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/)
  .refine((key) => !key.split("/").some((part) => part === ".." || part === "." || part === ""), "Invalid private asset key");

export const CurriculumReviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unreviewed"), note: nonempty.optional() }),
  z.strictObject({ status: z.literal("needs-review"), note: nonempty }),
  z.strictObject({ status: z.literal("verified"), reviewer: nonempty, reviewedAt: z.iso.datetime(), note: nonempty.optional() }),
]);

// Rendering kind and semantic role are independent. Tables retain cell markup,
// merged cells and captions without flattening them to plain text.
const tableCell = z.strictObject({
  text: z.string(), format: z.enum(["plain", "markdown"]),
  rowSpan: z.number().int().positive().optional(), colSpan: z.number().int().positive().optional(),
  header: z.boolean().optional(),
});
export const CurriculumContentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: nonempty, format: z.enum(["plain", "markdown"]) }),
  z.strictObject({ type: z.literal("code"), code: nonempty, language: nonempty, caption: nonempty.optional() }),
  z.strictObject({ type: z.literal("table"), rows: z.array(z.array(tableCell).min(1)).min(1), caption: nonempty.optional() }),
  z.strictObject({ type: z.enum(["image", "diagram"]), assetKey: privateAsset, alt: nonempty, caption: nonempty.optional() }),
]);
export const CurriculumRichContentSchema = z.array(CurriculumContentSchema).min(1);

export const CurriculumSubjectSchema = z.strictObject({
  id: CurriculumIdSchema, code: CurriculumIdSchema, title: nonempty, position,
}).refine((subject) => subject.id === subject.code, "Subject id must equal its stable code");

export const CurriculumSourceDocumentSchema = z.strictObject({
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, title: nonempty, edition: nonempty,
  sha256: z.string().regex(/^[a-f0-9]{64}$/), pdfPageCount: z.number().int().positive(),
  assetKey: privateAsset,
});
export const CurriculumChapterSchema = z.strictObject({
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, number: nonempty.optional(), title: nonempty, position,
});
export const CurriculumSectionSchema = z.strictObject({
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, chapterId: CurriculumIdSchema,
  parentSectionId: CurriculumIdSchema.nullable(), number: nonempty.optional(), title: nonempty, position,
});
export const CurriculumSourceBlockSchema = z.strictObject({
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, sectionId: CurriculumIdSchema,
  sourceDocumentId: CurriculumIdSchema, position, revision: nonempty,
  role: z.enum(["body", "definition", "comparison", "procedure", "relationship", "decision", "case-study", "summary", "term", "quiz", "answer", "example", "before", "after", "exercise"]),
  content: CurriculumRichContentSchema,
  location: z.strictObject({
    pdfPageStart: z.number().int().positive(), pdfPageEnd: z.number().int().positive(),
    printedPageStart: nonempty.optional(), printedPageEnd: nonempty.optional(),
    locator: nonempty.optional(),
    // Normalized PDF bounding box, when extraction can provide it.
    bounds: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })
      .refine((b) => b.x + b.width <= 1 && b.y + b.height <= 1, "Bounds exceed page").optional(),
  }).refine((l) => l.pdfPageEnd >= l.pdfPageStart, "Reversed PDF page range"),
  extraction: z.strictObject({ method: z.enum(["manual", "pdf-text", "ocr"]), toolVersion: nonempty, extractedAt: z.iso.datetime() }),
  review: CurriculumReviewSchema,
});
export const CurriculumKnowledgePointSchema = z.strictObject({
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, sectionId: CurriculumIdSchema,
  title: nonempty, statement: CurriculumRichContentSchema,
  kind: z.enum(["definition", "fact", "distinction", "relationship", "rule", "process", "decision-rule", "principle", "pattern"]),
  sourceBlockIds: evidence, review: CurriculumReviewSchema,
});

const answerMetadata = {
  status: z.enum(["official", "proposed"]), sourceBlockIds: references,
  explanation: CurriculumRichContentSchema.optional(),
};
const unresolved = z.strictObject({ status: z.literal("unresolved"), reason: nonempty });
const questionBase = {
  id: CurriculumIdSchema, subjectId: CurriculumIdSchema, chapterId: CurriculumIdSchema,
  sectionId: CurriculumIdSchema.nullable(), position,
  origin: z.enum(["textbook-quiz", "textbook-derived"]), prompt: CurriculumRichContentSchema,
  sourceBlockIds: evidence, knowledgePointIds: references,
  // SourceBlock is canonical; pipeline must bump its revision after edits.
  transformation: z.strictObject({ sourceBlockId: CurriculumIdSchema, sourceRevision: nonempty, method: z.enum(["verbatim", "normalized"]), toolVersion: nonempty }),
  review: CurriculumReviewSchema,
};
const choice = z.strictObject({ id: CurriculumIdSchema, content: CurriculumRichContentSchema });
export const CurriculumQuestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...questionBase, kind: z.enum(["single-choice", "multiple-choice"]), choices: z.array(choice).min(2),
    answer: z.union([unresolved, z.strictObject({ ...answerMetadata, correctChoiceIds: evidence })]),
  }),
  z.strictObject({ ...questionBase, kind: z.literal("short-answer"),
    answer: z.union([unresolved, z.strictObject({ ...answerMetadata, acceptedAnswers: z.array(nonempty).min(1), matching: z.enum(["exact", "case-insensitive"]) })]),
  }),
  z.strictObject({ ...questionBase, kind: z.literal("self-assessment"),
    answer: z.union([unresolved, z.strictObject({ ...answerMetadata, rubric: CurriculumRichContentSchema, sampleAnswer: CurriculumRichContentSchema.optional() })]),
  }),
]).superRefine((q, ctx) => {
  const issue = (message: string, path: string[]) => ctx.addIssue({ code: "custom", message, path });
  if ("choices" in q) {
    const ids = q.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) issue("Duplicate choice id", ["choices"]);
    if (q.answer.status !== "unresolved") {
      if (q.answer.correctChoiceIds.some((id) => !ids.includes(id))) issue("Answer references unknown choice", ["answer", "correctChoiceIds"]);
      if (q.kind === "single-choice" && q.answer.correctChoiceIds.length !== 1) issue("Single choice requires one answer", ["answer", "correctChoiceIds"]);
    }
  }
  if (q.answer.status === "official" && q.answer.sourceBlockIds.length === 0) issue("Official answer requires textbook evidence", ["answer", "sourceBlockIds"]);
});

export const CurriculumBundleSchema = z.strictObject({
  schema: z.literal("curriculum-bundle.v1"), subject: CurriculumSubjectSchema,
  sourceDocuments: z.array(CurriculumSourceDocumentSchema).min(1),
  chapters: z.array(CurriculumChapterSchema).min(1), sections: z.array(CurriculumSectionSchema).min(1),
  sourceBlocks: z.array(CurriculumSourceBlockSchema).min(1),
  knowledgePoints: z.array(CurriculumKnowledgePointSchema), questions: z.array(CurriculumQuestionSchema),
}).superRefine((bundle, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
  const collections = ["sourceDocuments", "chapters", "sections", "sourceBlocks", "knowledgePoints", "questions"] as const;
  // Shared namespace prevents accidental reuse across kinds as well as in arrays.
  const ids = new Set<string>();
  for (const name of collections) bundle[name].forEach((entity, i) => {
    if (ids.has(entity.id)) issue("Duplicate entity id", [name, i, "id"]);
    ids.add(entity.id);
    if (entity.subjectId !== bundle.subject.id) issue("Cross-subject entity", [name, i, "subjectId"]);
  });
  const docs = new Map(bundle.sourceDocuments.map((e) => [e.id, e]));
  const chapters = new Map(bundle.chapters.map((e) => [e.id, e]));
  const sections = new Map(bundle.sections.map((e) => [e.id, e]));
  const blocks = new Map(bundle.sourceBlocks.map((e) => [e.id, e]));
  const knowledge = new Set(bundle.knowledgePoints.map((e) => e.id));
  const positions = new Set<string>();
  const order = (scope: string, value: number, path: (string | number)[]) => {
    const key = `${scope}:${value}`;
    if (positions.has(key)) issue("Duplicate sibling position", path);
    positions.add(key);
  };
  bundle.chapters.forEach((e, i) => order("chapters", e.position, ["chapters", i, "position"]));
  bundle.sections.forEach((e, i) => {
    const path = ["sections", i];
    if (!chapters.has(e.chapterId)) issue("Unknown chapter", [...path, "chapterId"]);
    order(JSON.stringify(["section", e.chapterId, e.parentSectionId]), e.position, [...path, "position"]);
    if (e.parentSectionId !== null) {
      const parent = sections.get(e.parentSectionId);
      if (!parent || parent.chapterId !== e.chapterId) issue("Invalid parent section", [...path, "parentSectionId"]);
    }
    const visited = new Set([e.id]);
    let parentId = e.parentSectionId;
    while (parentId !== null) {
      if (visited.has(parentId)) { issue("Section cycle", [...path, "parentSectionId"]); break; }
      visited.add(parentId);
      parentId = sections.get(parentId)?.parentSectionId ?? null;
    }
  });
  bundle.sourceBlocks.forEach((e, i) => {
    if (!sections.has(e.sectionId)) issue("Unknown section", ["sourceBlocks", i, "sectionId"]);
    const doc = docs.get(e.sourceDocumentId);
    if (!doc) issue("Unknown source document", ["sourceBlocks", i, "sourceDocumentId"]);
    else if (e.location.pdfPageEnd > doc.pdfPageCount) issue("Page exceeds source document", ["sourceBlocks", i, "location"]);
    order(`block:${e.sectionId}`, e.position, ["sourceBlocks", i, "position"]);
  });
  const checkSources = (refs: string[], path: (string | number)[]) => refs.forEach((id, i) => {
    if (!blocks.has(id)) issue("Unknown source block", [...path, i]);
  });
  bundle.knowledgePoints.forEach((e, i) => {
    if (!sections.has(e.sectionId)) issue("Unknown section", ["knowledgePoints", i, "sectionId"]);
    checkSources(e.sourceBlockIds, ["knowledgePoints", i, "sourceBlockIds"]);
  });
  bundle.questions.forEach((q, i) => {
    const path = ["questions", i];
    if (!chapters.has(q.chapterId)) issue("Unknown chapter", [...path, "chapterId"]);
    if (q.sectionId !== null && sections.get(q.sectionId)?.chapterId !== q.chapterId) issue("Question section/chapter mismatch", [...path, "sectionId"]);
    order(JSON.stringify(["question", q.chapterId, q.sectionId]), q.position, [...path, "position"]);
    checkSources(q.sourceBlockIds, [...path, "sourceBlockIds"]);
    q.knowledgePointIds.forEach((id, k) => {
      if (!knowledge.has(id)) issue("Unknown knowledge point", [...path, "knowledgePointIds", k]);
    });
    const source = blocks.get(q.transformation.sourceBlockId);
    if (!source || !q.sourceBlockIds.includes(source.id)) issue("Missing canonical question source", [...path, "transformation"]);
    else {
      if (q.origin === "textbook-quiz" && source.role !== "quiz") issue("Textbook quiz must reference a quiz block", [...path, "transformation"]);
      if (q.transformation.sourceRevision !== source.revision) issue("Stale question source revision", [...path, "transformation"]);
      if (sections.get(source.sectionId)?.chapterId !== q.chapterId) issue("Question source/chapter mismatch", [...path, "transformation"]);
      if (q.sectionId !== null && source.sectionId !== q.sectionId) issue("Question source/section mismatch", [...path, "transformation"]);
    }
    if (q.answer.status !== "unresolved") {
      checkSources(q.answer.sourceBlockIds, [...path, "answer", "sourceBlockIds"]);
      if (q.answer.sourceBlockIds.some((id) => !q.sourceBlockIds.includes(id))) issue("Answer evidence must be a question source", [...path, "answer", "sourceBlockIds"]);
    }
  });
});

export type CurriculumBundle = z.infer<typeof CurriculumBundleSchema>;
export type CurriculumSubject = z.infer<typeof CurriculumSubjectSchema>;
export type CurriculumSourceDocument = z.infer<typeof CurriculumSourceDocumentSchema>;
export type CurriculumChapter = z.infer<typeof CurriculumChapterSchema>;
export type CurriculumSection = z.infer<typeof CurriculumSectionSchema>;
export type CurriculumSourceBlock = z.infer<typeof CurriculumSourceBlockSchema>;
export type CurriculumKnowledgePoint = z.infer<typeof CurriculumKnowledgePointSchema>;
export type CurriculumQuestion = z.infer<typeof CurriculumQuestionSchema>;
export type CurriculumContent = z.infer<typeof CurriculumContentSchema>;
export type CurriculumRichContent = z.infer<typeof CurriculumRichContentSchema>;
export type CurriculumReview = z.infer<typeof CurriculumReviewSchema>;
