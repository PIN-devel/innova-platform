import { CurriculumBundleSchema, type CurriculumContent } from "@innova/contracts";

// Invented, public-safe sample only. Never seed actual textbook material here.
const subjectId = "synthetic-curriculum";
const text = (value: string): CurriculumContent => ({ type: "text", text: value, format: "plain" });
const review = { status: "unreviewed" } as const;
const source = { sourceDocumentId: "sample-document", revision: "sample-1", extraction: { method: "manual", toolVersion: "synthetic-1", extractedAt: "2026-01-01T00:00:00Z" }, review } as const;
const q = { subjectId, chapterId: "sample-chapter", sectionId: "sample-child", origin: "textbook-quiz", prompt: [text("Invented sample question")], sourceBlockIds: ["sample-quiz", "sample-answer"], knowledgePointIds: ["sample-knowledge"], transformation: { sourceBlockId: "sample-quiz", sourceRevision: "sample-1", method: "verbatim", toolVersion: "synthetic-1" }, review } as const;
export const mockCurriculum = CurriculumBundleSchema.parse({
  schema: "curriculum-bundle.v1",
  subject: { id: subjectId, code: subjectId, title: "Curriculum 합성 샘플", position: 1 },
  sourceDocuments: [{ id: "sample-document", subjectId, title: "Invented document", edition: "synthetic", sha256: "a".repeat(64), pdfPageCount: 5, assetKey: "synthetic/document.pdf" }],
  chapters: [{ id: "sample-chapter", subjectId, title: "Synthetic Chapter", position: 0, readingOrder: ["sample-before", "sample-child-body", "sample-after", "sample-quiz", "sample-answer"] }],
  sections: [
    { id: "sample-child", subjectId, chapterId: "sample-chapter", parentSectionId: "sample-parent", title: "Synthetic child", position: 0 },
    { id: "sample-parent", subjectId, chapterId: "sample-chapter", parentSectionId: null, title: "Synthetic parent", position: 0 },
  ],
  sourceBlocks: [
    { ...source, id: "sample-after", subjectId, sectionId: "sample-parent", position: 1, role: "after", content: [text("Synthetic parent continuation")], location: { pdfPageStart: 3, pdfPageEnd: 3 } },
    { ...source, id: "sample-child-body", subjectId, sectionId: "sample-child", position: 0, role: "example", content: [{ type: "code", code: "const sample = 1;", language: "typescript" }, { type: "table", rows: [[{ text: "Sample header", format: "plain", header: true, colSpan: 2 }], [{ text: "A", format: "plain" }, { text: "B", format: "plain" }]] }, { type: "image", assetKey: "synthetic/sample.png", alt: "Synthetic image" }], location: { pdfPageStart: 2, pdfPageEnd: 2 } },
    { ...source, id: "sample-before", subjectId, sectionId: "sample-parent", position: 0, role: "before", content: [text("Synthetic parent introduction")], location: { pdfPageStart: 1, pdfPageEnd: 1 } },
    { ...source, id: "sample-quiz", subjectId, sectionId: "sample-child", position: 1, role: "quiz", content: [text("Synthetic quiz source")], location: { pdfPageStart: 4, pdfPageEnd: 4 } },
    { ...source, id: "sample-answer", subjectId, sectionId: "sample-child", position: 2, role: "answer", content: [text("Synthetic answer source")], location: { pdfPageStart: 5, pdfPageEnd: 5 } },
  ],
  knowledgePoints: [{ id: "sample-knowledge", subjectId, sectionId: "sample-child", title: "Synthetic knowledge", statement: [text("Synthetic statement")], kind: "fact", sourceBlockIds: ["sample-child-body"], review }],
  questions: [
    { ...q, id: "sample-choice", kind: "single-choice", position: 0, choices: [{ id: "sample-a", content: [text("Sample A")] }, { id: "sample-b", content: [text("Sample B")] }], answer: { status: "official", correctChoiceIds: ["sample-a"], sourceBlockIds: ["sample-answer"], explanation: [text("Synthetic explanation")] } },
    { ...q, id: "sample-short", kind: "short-answer", position: 1, answer: { status: "official", acceptedAnswers: ["Sample"], matching: "exact", sourceBlockIds: ["sample-answer"], explanation: [text("Synthetic explanation")] } },
  ],
});
