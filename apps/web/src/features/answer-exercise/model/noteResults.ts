import type { Exercise } from "@/entities/bank";
import type { SessionAnswer } from "@/entities/progress";
import type { GradeInput } from "./grade";

/** Attribute progress without changing the whole exercise's grade or score. */
export function getNoteResults(
  exercise: Exercise,
  given: GradeInput["given"] | null,
  correct: boolean,
): NonNullable<SessionAnswer["noteResults"]> {
  if (exercise.type === "pair") {
    const links = Array.isArray(given) ? given : [];
    return exercise.pairs.map((pair) => {
      const matches = links.filter((link) => link.leftId === pair.noteId);
      return {
        noteId: pair.noteId,
        correct: matches.length === 1 && matches[0]?.rightId === pair.noteId,
      };
    });
  }
  return [{ noteId: exercise.reviewSourceNoteId ?? exercise.noteId, correct }];
}
