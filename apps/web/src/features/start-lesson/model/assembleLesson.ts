import type { BankFile, Exercise, LessonSession } from "@/entities/bank";
import { UNITS, unitTitle } from "@/entities/bank";
import type { ConceptNote } from "@/entities/concept";
import type { ScenarioNote } from "@/entities/scenario";
import { shuffle } from "@/shared/lib/shuffle";
import { makeCloze, makeMcq, makeOx, makeScenario, makeShort } from "./fromNotes";

export type AssembleOptions = {
  chapter?: number;
  tag?: string;
  deck?: string;
};

export type TaskCluster = {
  taskTag: string;
  chapter: number;
  concepts: readonly [ConceptNote, ConceptNote];
  scenario: ScenarioNote;
};

const TASK_TAG = /^T\d+\.\d+$/;

function newSessionId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .slice(0, 13)
    .replace("T", "-");
  return `s-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
}

function exactTaskTags(note: { tags: readonly string[] }): string[] {
  return note.tags.filter((tag) => TASK_TAG.test(tag));
}

/**
 * Resolves the education-approved two-concept + one-scenario Task boundary.
 *
 * A Task tag alone is insufficient because a concept may be shared across Tasks.
 * Requiring the scenario chapter as well excludes those shared-tag false positives.
 * Ambiguous or incomplete clusters are omitted instead of being filled cross-Task.
 */
export function resolveTaskClusters(bank: BankFile): TaskCluster[] {
  const clusters: TaskCluster[] = [];

  for (const scenario of bank.scenarios) {
    const taskTags = exactTaskTags(scenario);
    if (taskTags.length !== 1) continue;
    const taskTag = taskTags[0];
    if (!taskTag) continue;

    const scenarios = bank.scenarios.filter(
      (candidate) => candidate.tags.includes(taskTag),
    );
    if (scenarios.length !== 1) continue;

    const concepts = bank.concepts.filter(
      (concept) =>
        concept.chapter === scenario.chapter && concept.tags.includes(taskTag),
    );
    if (concepts.length !== 2) continue;

    const conceptA = concepts[0];
    const conceptB = concepts[1];
    if (!conceptA || !conceptB) continue;

    clusters.push({
      taskTag,
      chapter: scenario.chapter,
      concepts: [conceptA, conceptB],
      scenario,
    });
  }

  return clusters;
}

function clusterInScope(cluster: TaskCluster, options: AssembleOptions): boolean {
  if (options.chapter !== undefined && cluster.chapter !== options.chapter) {
    return false;
  }
  if (options.tag) {
    if (TASK_TAG.test(options.tag)) return cluster.taskTag === options.tag;
    const tagged = [...cluster.concepts, cluster.scenario].some(
      (note) => note.tags.includes(options.tag!),
    );
    const decked = cluster.concepts.some(
      (concept) => concept.deck === options.tag,
    );
    if (!tagged && !decked) return false;
  }
  if (
    options.deck &&
    !cluster.concepts.some((concept) => concept.deck === options.deck)
  ) {
    return false;
  }
  return true;
}

function exerciseSource(exercise: Exercise): string {
  return `${exercise.type}:${exercise.noteId}`;
}

function hasMcq(concept: ConceptNote): boolean {
  return Boolean(
    concept.mcqStem &&
      concept.mcqChoices &&
      concept.mcqAnswerIndex !== undefined,
  );
}

function hasOx(concept: ConceptNote): boolean {
  return Boolean(concept.trap && concept.trapAnswer !== undefined);
}

function canBuildTaskSequence(cluster: TaskCluster): boolean {
  const [conceptA, conceptB] = cluster.concepts;
  const distinctionType = hasOx(conceptA)
    ? "ox"
    : hasMcq(conceptA)
      ? "mcq"
      : null;
  const ruleReuseType = hasMcq(conceptB)
    ? "mcq"
    : hasOx(conceptB)
      ? "ox"
      : null;
  if (!distinctionType || !ruleReuseType) return false;

  const usedSources = new Set([
    `cloze-or-short:${conceptA.id}`,
    `short:${conceptB.id}`,
    `${distinctionType}:${conceptA.id}`,
    `${ruleReuseType}:${conceptB.id}`,
  ]);
  const combinationSources = [
    hasMcq(conceptA) ? `mcq:${conceptA.id}` : null,
    hasMcq(conceptB) ? `mcq:${conceptB.id}` : null,
    hasOx(conceptA) ? `ox:${conceptA.id}` : null,
    hasOx(conceptB) ? `ox:${conceptB.id}` : null,
  ];
  return combinationSources.some(
    (source) => source !== null && !usedSources.has(source),
  );
}

function buildTaskSequence(cluster: TaskCluster): Exercise[] | null {
  const [conceptA, conceptB] = cluster.concepts;

  // Role names, not interaction quotas, own the fallback policy.
  const recognition = makeCloze(conceptA) ?? makeShort(conceptA);
  // makeShort derives a term answer when no explicit shortAnswer exists.
  const recall = makeShort(conceptB);
  const distinction = makeOx(conceptA) ?? makeMcq(conceptA);
  const ruleReuse = makeMcq(conceptB) ?? makeOx(conceptB);
  if (!recognition || !recall || !distinction || !ruleReuse) return null;

  const firstFour = [recognition, recall, distinction, ruleReuse];
  const usedSources = new Set(firstFour.map(exerciseSource));
  const combinationCandidates = [
    makeMcq(conceptA),
    makeMcq(conceptB),
    makeOx(conceptA),
    makeOx(conceptB),
  ];
  const combination = combinationCandidates.find(
    (candidate) =>
      candidate !== null && !usedSources.has(exerciseSource(candidate)),
  );
  if (!combination) return null;

  return [
    ...firstFour,
    combination,
    makeScenario(cluster.scenario),
  ];
}

function withOccurrenceIds(
  sessionId: string,
  exercises: readonly Exercise[],
): Exercise[] {
  return exercises.map((exercise, index) => ({
    ...exercise,
    id: `${sessionId}-${index + 1}-${exercise.id}`,
  }));
}

export function assembleLesson(
  bank: BankFile,
  options: AssembleOptions = {},
): LessonSession | null {
  const eligible = resolveTaskClusters(bank)
    .filter((cluster) => clusterInScope(cluster, options))
    .filter(canBuildTaskSequence);

  const selected = shuffle(eligible)[0];
  if (!selected) return null;
  const exercises = buildTaskSequence(selected);
  if (!exercises) return null;

  const sessionId = newSessionId();
  const title = options.chapter
    ? `${unitTitle(options.chapter)} 레슨`
    : options.tag
      ? `${options.tag} 레슨`
      : options.deck
        ? `${options.deck} 레슨`
        : "오늘 레슨";

  return {
    sessionId,
    kind: "lesson",
    title,
    startedAt: new Date().toISOString(),
    exercises: withOccurrenceIds(sessionId, exercises),
    chapter: selected.chapter,
    tag: options.tag ?? options.deck,
  };
}

function topEntry<Key>(counts: Map<Key, number>): Key | undefined {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function recommendLesson(
  bank: BankFile,
  notes: Record<string, { mastery: number; nextDue: string }>,
  today: string,
): AssembleOptions {
  const due = bank.concepts.filter((concept) => {
    const progress = notes[concept.id];
    if (!progress) return true;
    return progress.nextDue <= today;
  });

  if (due.length) {
    const byChapter = new Map<number, number>();
    for (const concept of due) {
      byChapter.set(
        concept.chapter,
        (byChapter.get(concept.chapter) ?? 0) + 1,
      );
    }
    const chapter = topEntry(byChapter);

    if (chapter !== undefined) {
      const eligible = resolveTaskClusters(bank).filter(
        (cluster) =>
          cluster.chapter === chapter && canBuildTaskSequence(cluster),
      );
      const taskCounts = new Map<string, number>();
      const dueIds = new Set(
        due.filter((concept) => concept.chapter === chapter).map((concept) => concept.id),
      );
      for (const cluster of eligible) {
        const count = cluster.concepts.filter((concept) =>
          dueIds.has(concept.id),
        ).length;
        if (count > 0) taskCounts.set(cluster.taskTag, count);
      }
      const taskTag = topEntry(taskCounts);
      if (taskTag) return { chapter, tag: taskTag };

      // Preserve failure visibility for a due Task that cannot satisfy the contract.
      const dueTaskCounts = new Map<string, number>();
      for (const concept of due.filter((item) => item.chapter === chapter)) {
        for (const taskTag of exactTaskTags(concept)) {
          dueTaskCounts.set(taskTag, (dueTaskCounts.get(taskTag) ?? 0) + 1);
        }
      }
      const dueTaskTag = topEntry(dueTaskCounts);
      if (dueTaskTag) return { chapter, tag: dueTaskTag };
      return { chapter };
    }
  }

  const unitIds = UNITS.map((unit) => unit.id);
  const chapterScores = unitIds.map((chapter) => {
    const concepts = bank.concepts.filter((concept) => concept.chapter === chapter);
    if (!concepts.length) return { chapter, mastery: 101 };
    const sum = concepts.reduce(
      (total, concept) => total + (notes[concept.id]?.mastery ?? 0),
      0,
    );
    return { chapter, mastery: sum / concepts.length };
  });
  const lowest = chapterScores.sort((a, b) => a.mastery - b.mastery)[0];
  return { chapter: lowest?.chapter ?? 1 };
}

export function pickPrimaryDeck(concepts: ConceptNote[]): string {
  const counts = new Map<string, number>();
  for (const concept of concepts) {
    counts.set(concept.deck, (counts.get(concept.deck) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "혼동짝";
}
