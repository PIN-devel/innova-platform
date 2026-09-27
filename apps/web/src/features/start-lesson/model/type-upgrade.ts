import type { Exercise, ExerciseType, BankFile } from "@/entities/bank";
import type { ConceptNote } from "@/entities/concept";
import type { ScenarioNote } from "@/entities/scenario";
import {
  makeCloze,
  makeMcq,
  makeScenario,
  makeShort,
} from "./from-notes";

/**
 * DRILL-24 (G4) type-upgrade map — 재인 → 소환 → 사례 (one step harder)
 *
 * | Original (wrong) | Upgraded retry                                              |
 * |------------------|-------------------------------------------------------------|
 * | pair, ox         | cloze → short (recall)                                      |
 * | mcq              | scenario_mcq (unique topic match) → short → cloze (recall) |
 * | cloze            | short (harder recall) → cloze                               |
 * | short            | scenario_mcq if available → short                           |
 * | scenario_mcq     | scenario_mcq (already top of ladder)                        |
 *
 * Cognitive ladder: 재인(pair/ox) → 소환(cloze/short) → 사례(scenario_mcq).
 * mcq sits mid-ladder and jumps to 사례 when a related scenario exists.
 */
export const TYPE_UPGRADE_MAP = {
  pair: ["cloze", "short"] as const,
  ox: ["cloze", "short"] as const,
  mcq: ["scenario_mcq", "short", "cloze"] as const,
  cloze: ["short", "cloze"] as const,
  short: ["scenario_mcq", "short"] as const,
  scenario_mcq: ["scenario_mcq"] as const,
} as const satisfies Record<ExerciseType, readonly ExerciseType[]>;

export type WrongTypeMap = Partial<Record<string, ExerciseType>>;

function topicKey(value: string): string {
  return value.toLowerCase().trim()
    .replace(/^(aws|amazon)\s+/, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

// Scope and broad trade-offs are not evidence that two notes test the same concept.
const CONTEXT_TAGS = new Set([
  "cost", "security", "networking", "governance", "identity", "performance",
  "reliability", "storage", "ha", "dr", "hybrid", "multiaccount", "crossaccount",
  "deployment", "modernization", "observability", "operationalexcellence",
  "currentservicename",
]);

function isTopicTag(tag: string): boolean {
  const scope = /^(sap[- ]?c02|aws|d\d+|t\d+\.\d+|(?:domain|chapter|unit|task|difficulty)[: -].*)$/i;
  return !scope.test(tag.trim()) && !CONTEXT_TAGS.has(topicKey(tag));
}

/** Require a unique topic match; scope alone must never substitute another concept. */
export function findRelatedScenario(
  bank: BankFile,
  note: ConceptNote,
  excludedScenarioIds: ReadonlySet<string> = new Set(),
): ScenarioNote | undefined {
  const topics = new Set(note.tags.filter(isTopicTag).map(topicKey));
  const names = new Set([note.term, ...note.termAliases].map(topicKey));
  const tasks = note.tags.filter((tag) => /^T\d+\.\d+$/i.test(tag));
  const candidates = bank.scenarios
    .filter((scenario) => {
      if (scenario.chapter !== note.chapter || excludedScenarioIds.has(scenario.id)) {
        return false;
      }
      const scenarioTasks = scenario.tags.filter((tag) => /^T\d+\.\d+$/i.test(tag));
      return !tasks.length || !scenarioTasks.length
        || tasks.some((task) => scenarioTasks.some(
          (other) => task.toLowerCase() === other.toLowerCase(),
        ));
    })
    .map((scenario) => {
      const tags = new Set(scenario.tags.filter(isTopicTag).map(topicKey));
      const score = [...tags].reduce(
        (sum, tag) => sum + (names.has(tag) ? 3 : topics.has(tag) ? 1 : 0), 0,
      );
      return { scenario, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score !== candidates[1]?.score ? best.scenario : undefined;
}

function buildByType(
  bank: BankFile,
  note: ConceptNote,
  type: ExerciseType,
  excludedScenarioIds: ReadonlySet<string>,
): Exercise | null {
  switch (type) {
    case "cloze":
      return makeCloze(note);
    case "short":
      return makeShort(note);
    case "mcq":
      return makeMcq(note);
    case "scenario_mcq": {
      const scenario = findRelatedScenario(bank, note, excludedScenarioIds);
      return scenario ? makeScenario(scenario) : null;
    }
    case "pair":
    case "ox":
      return null;
    default:
      return null;
  }
}

/**
 * Raise one step along 재인→소환→사례 for a wrong note.
 * Unknown / missing original type defaults to recognition → recall (cloze/short).
 */
export function upgradeWrongExercise(
  bank: BankFile,
  note: ConceptNote,
  originalType?: ExerciseType,
  excludedScenarioIds: ReadonlySet<string> = new Set(),
): Exercise | null {
  const from: ExerciseType = originalType ?? "pair";
  const ladder = TYPE_UPGRADE_MAP[from] ?? TYPE_UPGRADE_MAP.pair;
  for (const next of ladder) {
    const built = buildByType(bank, note, next, excludedScenarioIds);
    if (built) return { ...built, reviewSourceNoteId: note.id };
  }
  // A missing or ambiguous scenario must still review this concept through recall.
  return { ...makeShort(note), reviewSourceNoteId: note.id };
}
