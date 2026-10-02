import type { CurriculumBundle, CurriculumContent } from "@innova/contracts";

// Entirely invented test data; no textbook, extracted PDF or real answer key.
const text = (value: string): CurriculumContent => ({ type: "text", text: value, format: "plain" });

export function createSyntheticCurriculum(subjectId = "synthetic-architecture"): CurriculumBundle {
  const review = { status: "unreviewed" } as const;
  const transformation = { sourceBlockId: "block-quiz", sourceRevision: "revision-1", method: "normalized", toolVersion: "synthetic-1" } as const;
  const questionBase = {
    subjectId, chapterId: "chapter-1", sectionId: "section-child", origin: "textbook-quiz" as const,
    prompt: [text("Synthetic question with rich content"), { type: "code", code: "const sample = 1;", language: "typescript" } as const],
    sourceBlockIds: ["block-quiz", "block-answer"], knowledgePointIds: ["knowledge-1"], transformation, review,
  };
  return {
    schema: "curriculum-bundle.v1",
    subject: { id: subjectId, code: subjectId, title: "Synthetic curriculum", position: 0 },
    sourceDocuments: [{ id: "document-1", subjectId, title: "Invented test document", edition: "test edition", sha256: "a".repeat(64), pdfPageCount: 10, assetKey: "synthetic/document.pdf" }],
    chapters: [
      { id: "chapter-2", subjectId, number: "II", title: "Synthetic second chapter", position: 1 },
      { id: "chapter-1", subjectId, number: "I", title: "Synthetic first chapter", position: 0 },
    ],
    // Child deliberately precedes parent in input; position scopes are independent.
    sections: [
      { id: "section-child", subjectId, chapterId: "chapter-1", parentSectionId: "section-root", title: "Synthetic nested section", position: 0 },
      { id: "section-other", subjectId, chapterId: "chapter-2", parentSectionId: null, title: "Synthetic other section", position: 0 },
      { id: "section-root", subjectId, chapterId: "chapter-1", parentSectionId: null, title: "Synthetic root section", position: 0 },
    ],
    sourceBlocks: [
      {
        id: "block-body", subjectId, sectionId: "section-root", sourceDocumentId: "document-1", position: 0, revision: "revision-1", role: "comparison",
        content: [text("Invented comparison for validation"), { type: "table", caption: "Synthetic table", rows: [
          [{ text: "Sample", format: "plain", header: true, colSpan: 2 }],
          [{ text: "A", format: "plain" }, { text: "B", format: "markdown" }],
        ] }, { type: "diagram", assetKey: "synthetic/diagram.svg", alt: "Invented diagram" }],
        location: { pdfPageStart: 1, pdfPageEnd: 2, printedPageStart: "i", printedPageEnd: "ii", locator: "test figure" },
        extraction: { method: "manual", toolVersion: "synthetic-1", extractedAt: "2026-01-01T00:00:00Z" }, review,
      },
      {
        id: "block-quiz", subjectId, sectionId: "section-child", sourceDocumentId: "document-1", position: 0, revision: "revision-1", role: "quiz",
        content: [text("Invented quiz source"), { type: "code", code: "function sample() { return 1; }", language: "typescript" }],
        location: { pdfPageStart: 3, pdfPageEnd: 3 }, extraction: { method: "pdf-text", toolVersion: "synthetic-1", extractedAt: "2026-01-01T00:00:00Z" }, review,
      },
      {
        id: "block-answer", subjectId, sectionId: "section-child", sourceDocumentId: "document-1", position: 1, revision: "revision-1", role: "answer",
        content: [text("Invented answer evidence")], location: { pdfPageStart: 4, pdfPageEnd: 4 },
        extraction: { method: "ocr", toolVersion: "synthetic-1", extractedAt: "2026-01-01T00:00:00Z" }, review,
      },
    ],
    knowledgePoints: [{ id: "knowledge-1", subjectId, sectionId: "section-root", title: "Synthetic knowledge", statement: [text("Invented statement")], kind: "distinction", sourceBlockIds: ["block-body", "block-quiz"], review }],
    questions: [
      { ...questionBase, id: "question-single", kind: "single-choice", position: 0, choices: [{ id: "a", content: [text("A")] }, { id: "b", content: [text("B")] }], answer: { status: "official", correctChoiceIds: ["a"], sourceBlockIds: ["block-answer"], explanation: [text("Invented explanation")] } },
      { ...questionBase, id: "question-multiple", kind: "multiple-choice", position: 1, choices: [{ id: "a", content: [text("A")] }, { id: "b", content: [text("B")] }], answer: { status: "proposed", correctChoiceIds: ["a", "b"], sourceBlockIds: ["block-answer"] }, review: { status: "needs-review", note: "Synthetic ambiguity" } },
      { ...questionBase, id: "question-short", kind: "short-answer", position: 2, answer: { status: "official", acceptedAnswers: ["sample"], matching: "exact", sourceBlockIds: ["block-answer"] } },
      { ...questionBase, id: "question-self", kind: "self-assessment", position: 3, answer: { status: "proposed", rubric: [text("Inspect the synthetic responsibility")], sourceBlockIds: ["block-body"] }, sourceBlockIds: ["block-quiz", "block-body"] },
      { ...questionBase, id: "question-unresolved", kind: "short-answer", position: 4, answer: { status: "unresolved", reason: "No answer in synthetic document" } },
    ],
  };
}
