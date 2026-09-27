import type { BankFile, Exercise } from "@/entities/bank";
import type { ConceptNote } from "@/entities/concept";
import type { NoteProgress } from "@/entities/progress";

export type PrimerConcept = Pick<ConceptNote, "id" | "term" | "definition">;

/**
 * Selects new concepts in the order they first appear in the assembled lesson.
 * This is intentionally read-only: showing or dismissing the primer must not
 * change learning progress.
 */
export function selectPrimerConcepts(
  exercises: readonly Exercise[],
  bank: Pick<BankFile, "concepts">,
  notes: Readonly<Partial<Record<string, Pick<NoteProgress, "answered">>>>,
): PrimerConcept[] {
  const conceptsById = new Map(bank.concepts.map((concept) => [concept.id, concept]));
  const seen = new Set<string>();
  const selected: PrimerConcept[] = [];

  for (const exercise of exercises) {
    if (exercise.type === "scenario_mcq") continue;

    const noteIds = exercise.type === "pair" ? exercise.noteIds : [exercise.noteId];
    for (const noteId of noteIds) {
      if (seen.has(noteId)) continue;
      seen.add(noteId);

      const concept = conceptsById.get(noteId);
      if (!concept) continue;

      const progress = notes[noteId];
      if (progress && progress.answered > 0) continue;

      selected.push({
        id: concept.id,
        term: concept.term,
        definition: concept.definition,
      });
    }
  }

  return selected;
}
