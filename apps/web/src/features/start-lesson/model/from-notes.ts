import type {
  ClozeExercise,
  Exercise,
  McqExercise,
  OxExercise,
  PairExercise,
  PairItem,
  ShortExercise,
} from "@/entities/bank";
import type { ConceptNote } from "@/entities/concept";
import type { ScenarioNote } from "@/entities/scenario";
import { shuffle } from "@/shared/lib/shuffle";

export function parseCloze(template: string): {
  answers: string[];
  isList: boolean;
} {
  const matches = [...template.matchAll(/\{\{([^}]+)\}\}/g)].map((m) =>
    (m[1] ?? "").trim(),
  );
  const first = matches[0] ?? "";
  const isList = /[·•]/.test(first) || first.split(/\s+/).length >= 3;
  return { answers: matches, isList };
}

export function makePair(
  primary: ConceptNote,
  others: ConceptNote[],
  allowConfusion: boolean,
): PairExercise | null {
  const pool: PairItem[] = [];
  const usedTerms = new Set<string>();
  const usedDefs = new Set<string>();

  const push = (note: ConceptNote) => {
    if (usedTerms.has(note.term) || usedDefs.has(note.definition)) return;
    usedTerms.add(note.term);
    usedDefs.add(note.definition);
    pool.push({
      noteId: note.id,
      term: note.term,
      definition: note.definition,
    });
  };

  push(primary);
  const partner = primary.pairTerm
    ? others.find(
        (n) =>
          n.id !== primary.id &&
          (n.term === primary.pairTerm ||
            n.termAliases.includes(primary.pairTerm ?? "")),
      )
    : undefined;

  if (allowConfusion && partner) push(partner);

  for (const note of others) {
    if (pool.length >= 4) break;
    if (note.id === primary.id) continue;
    if (!allowConfusion && partner && note.id === partner.id) continue;
    push(note);
  }

  if (pool.length < 3) return null;
  return {
    id: `ex-pair-${primary.id}`,
    type: "pair",
    noteId: primary.id,
    noteIds: pool.map((p) => p.noteId),
    chapter: primary.chapter,
    tags: primary.tags,
    rationale: primary.rationale,
    pairs: pool.slice(0, 4),
  };
}

export function makeMcq(note: ConceptNote): McqExercise | null {
  if (!note.mcqStem || !note.mcqChoices || note.mcqAnswerIndex === undefined) {
    return null;
  }
  const zipped = note.mcqChoices.map((choice, index) => ({
    choice,
    why: note.choiceWhy?.[index] ?? null,
    correct: index === note.mcqAnswerIndex,
  }));
  const shuffled = shuffle(zipped);
  const answerIndex = shuffled.findIndex((c) => c.correct);
  return {
    id: `ex-mcq-${note.id}`,
    type: "mcq",
    noteId: note.id,
    chapter: note.chapter,
    tags: note.tags,
    rationale: note.rationale,
    stem: note.mcqStem,
    choices: shuffled.map((c) => c.choice),
    answerIndex,
    choiceWhy: shuffled.map((c) => c.why),
  };
}

export function makeScenario(note: ScenarioNote): McqExercise {
  const zipped = note.choices.map((choice, index) => ({
    choice,
    why: note.choiceWhy?.[index] ?? null,
    correct: index === note.answerIndex,
  }));
  const shuffled = shuffle(zipped);
  const answerIndex = shuffled.findIndex((c) => c.correct);
  return {
    id: `ex-sc-${note.id}`,
    type: "scenario_mcq",
    noteId: note.id,
    chapter: note.chapter,
    tags: note.tags,
    rationale: note.rationale,
    stem: note.stem,
    choices: shuffled.map((c) => c.choice),
    answerIndex,
    choiceWhy: shuffled.map((c) => c.why),
  };
}

export function makeCloze(note: ConceptNote): ClozeExercise | null {
  if (!note.cloze) return null;
  const parsed = parseCloze(note.cloze);
  if (parsed.answers.length === 0 || parsed.answers.length > 2) return null;
  const answers = parsed.answers.map((a, i) => {
    const extra =
      i === 0
        ? [
            note.shortAnswer,
            ...(note.shortAnswerAliases ?? []),
            note.term,
            ...note.termAliases,
          ].filter((x): x is string => Boolean(x))
        : [];
    return Array.from(new Set([a, ...extra]));
  });
  return {
    id: `ex-cloze-${note.id}`,
    type: "cloze",
    noteId: note.id,
    chapter: note.chapter,
    tags: note.tags,
    rationale: note.rationale,
    template: note.cloze,
    answers,
    isList: parsed.isList,
  };
}

export function makeShort(note: ConceptNote): ShortExercise {
  const answer = note.shortAnswer ?? note.term;
  const aliases = [
    ...(note.shortAnswerAliases ?? []),
    note.term,
    ...note.termAliases,
  ];
  const prompt =
    note.shortPrompt ?? `다음 정의에 해당하는 용어는?\n${note.definition}`;
  return {
    id: `ex-short-${note.id}`,
    type: "short",
    noteId: note.id,
    chapter: note.chapter,
    tags: note.tags,
    rationale: note.rationale,
    prompt,
    answers: Array.from(new Set([answer, ...aliases])),
    nearMiss: note.nearMiss,
  };
}

export function makeOx(note: ConceptNote): OxExercise | null {
  if (!note.trap || note.trapAnswer === undefined) return null;
  return {
    id: `ex-ox-${note.id}`,
    type: "ox",
    noteId: note.id,
    chapter: note.chapter,
    tags: note.tags,
    rationale: note.rationale,
    statement: note.trap,
    answer: note.trapAnswer,
    trapWhy: note.trapWhy ?? note.rationale,
  };
}

export function fallbackExercise(note: ConceptNote): Exercise | null {
  return makeMcq(note) ?? makeCloze(note) ?? makeOx(note) ?? makeShort(note);
}
