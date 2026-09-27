import type { BankFile, Exercise, LessonSession } from "@/entities/bank";
import { makeScenario } from "./from-notes";
import {
  TYPE_UPGRADE_MAP,
  type WrongTypeMap,
  upgradeWrongExercise,
} from "./type-upgrade";

export { TYPE_UPGRADE_MAP };
export type { WrongTypeMap };

/**
 * Assemble a review session from wrong-box note ids.
 * Forces harder exercise types via {@link TYPE_UPGRADE_MAP} (DRILL-24 G4).
 * kind is always "review". No hearts/streak side effects here.
 */
export function assembleReview(
  bank: BankFile,
  wrongIds: string[],
  wrongTypes: WrongTypeMap = {},
): LessonSession | null {
  const unique = [...new Set(wrongIds)];
  if (unique.length === 0) return null;

  const exercises: Exercise[] = [];
  // Reserve direct scenario retries before allocating scenarios to concepts.
  const scenarioIds = new Set(bank.scenarios.map((scenario) => scenario.id));
  const usedScenarios = new Set(unique.filter((id) => scenarioIds.has(id)));

  for (const id of unique) {
    if (exercises.length >= 6) break;

    const scenario = bank.scenarios.find((s) => s.id === id);
    if (scenario) {
      // Scenario ids in the wrong box stay at scenario_mcq (top of ladder).
      exercises.push(makeScenario(scenario));
      continue;
    }

    const note = bank.concepts.find((c) => c.id === id);
    if (!note) continue;

    const harder = upgradeWrongExercise(bank, note, wrongTypes[id], usedScenarios);
    if (!harder) continue;
    exercises.push(harder);
    if (harder.type === "scenario_mcq") usedScenarios.add(harder.noteId);
  }

  if (!exercises.length) return null;
  const sessionId = `s-rev-${Date.now()}`;
  return {
    sessionId,
    kind: "review",
    title: "오답 다시 풀기",
    startedAt: new Date().toISOString(),
    // Answer identity is per occurrence, independent of the source content ID.
    exercises: exercises.map((exercise, index) => ({
      ...exercise,
      id: `${sessionId}-${index}-${exercise.id}`,
    })),
  };
}
