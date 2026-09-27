import type { Exercise } from "@/entities/bank";
import { answersMatch, normalizeAnswer } from "./normalize";

export type GradeOk = {
  correct: true;
  nearMiss: false;
  message: string;
  expected: string;
  extra?: string;
};

export type GradeNearMiss = {
  correct: false;
  nearMiss: true;
  message: string;
  expected: string;
};

export type GradeWrong = {
  correct: false;
  nearMiss: false;
  message: string;
  expected: string;
  extra?: string;
};

export type GradeResult = GradeOk | GradeNearMiss | GradeWrong;

export type GradeInput = {
  exercise: Exercise;
  given: string | number | boolean | Array<{ leftId: string; rightId: string }>;
};

function ok(exercise: Exercise, expected: string, extra?: string): GradeOk {
  return {
    correct: true,
    nearMiss: false,
    message: `정답 — ${exercise.rationale}`,
    expected,
    extra,
  };
}

function wrong(
  exercise: Exercise,
  expected: string,
  extra?: string,
): GradeWrong {
  return {
    correct: false,
    nearMiss: false,
    message: `오답 — ${exercise.rationale}`,
    expected,
    extra,
  };
}

export function expectedLabel(exercise: Exercise): string {
  switch (exercise.type) {
    case "pair":
      return exercise.pairs.map((p) => `${p.term} ↔ ${p.definition}`).join(" / ");
    case "mcq":
    case "scenario_mcq":
      return exercise.choices[exercise.answerIndex] ?? "";
    case "cloze":
      return exercise.answers.map((a) => a[0] ?? "").join(", ");
    case "short":
      return exercise.answers[0] ?? "";
    case "ox":
      return exercise.answer ? "참" : "거짓";
  }
}

export function gradeExercise(input: GradeInput): GradeResult {
  const { exercise, given } = input;
  switch (exercise.type) {
    case "pair":
      return gradePair(exercise, given);
    case "mcq":
    case "scenario_mcq":
      return gradeMcq(exercise, given);
    case "cloze":
      return gradeCloze(exercise, given);
    case "short":
      return gradeShort(exercise, given);
    case "ox":
      return gradeOx(exercise, given);
  }
}

function gradePair(
  exercise: Extract<Exercise, { type: "pair" }>,
  given: GradeInput["given"],
): GradeResult {
  if (!Array.isArray(given)) {
    return wrong(exercise, expectedLabel(exercise));
  }
  const byLeft = new Map(exercise.pairs.map((p) => [p.noteId, p.noteId]));
  if (given.length !== exercise.pairs.length) {
    return wrong(exercise, expectedLabel(exercise));
  }
  if (new Set(given.map((link) => link.leftId)).size !== exercise.pairs.length ||
      new Set(given.map((link) => link.rightId)).size !== exercise.pairs.length) {
    return wrong(exercise, expectedLabel(exercise));
  }
  const allMatch = given.every((link) => {
    if (!("leftId" in link) || !("rightId" in link)) return false;
    return byLeft.get(link.leftId) === link.rightId;
  });
  return allMatch
    ? ok(exercise, expectedLabel(exercise))
    : wrong(exercise, expectedLabel(exercise));
}

function gradeMcq(
  exercise: Extract<Exercise, { type: "mcq" | "scenario_mcq" }>,
  given: GradeInput["given"],
): GradeResult {
  const index = typeof given === "number" ? given : Number(given);
  const expected = expectedLabel(exercise);
  if (index === exercise.answerIndex) return ok(exercise, expected);
  const why = exercise.choiceWhy?.[index];
  return wrong(exercise, expected, why ?? undefined);
}

function gradeCloze(
  exercise: Extract<Exercise, { type: "cloze" }>,
  given: GradeInput["given"],
): GradeResult {
  const raw = String(given ?? "");
  const expected = expectedLabel(exercise);
  if (exercise.isList && exercise.answers.length === 1) {
    const accepted = exercise.answers.flat();
    return answersMatch(raw, accepted)
      ? ok(exercise, expected)
      : wrong(exercise, expected);
  }
  const parts = raw
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (exercise.answers.length === 1) {
    return answersMatch(raw, exercise.answers[0] ?? [])
      ? ok(exercise, expected)
      : wrong(exercise, expected);
  }
  const allOk =
    parts.length === exercise.answers.length &&
    exercise.answers.every((accepted, i) =>
      answersMatch(parts[i] ?? "", accepted),
    );
  return allOk ? ok(exercise, expected) : wrong(exercise, expected);
}

function gradeShort(
  exercise: Extract<Exercise, { type: "short" }>,
  given: GradeInput["given"],
): GradeResult {
  const raw = String(given ?? "");
  const expected = expectedLabel(exercise);
  if (answersMatch(raw, exercise.answers)) return ok(exercise, expected);
  if (exercise.nearMiss && answersMatch(raw, exercise.nearMiss.values)) {
    return {
      correct: false,
      nearMiss: true,
      message: exercise.nearMiss.message,
      expected,
    };
  }
  return wrong(exercise, expected);
}

function gradeOx(
  exercise: Extract<Exercise, { type: "ox" }>,
  given: GradeInput["given"],
): GradeResult {
  const value =
    given === true || given === "true" || given === "참"
      ? true
      : given === false || given === "false" || given === "거짓"
        ? false
        : null;
  const expected = expectedLabel(exercise);
  if (value === exercise.answer) {
    return ok(exercise, expected, exercise.trapWhy);
  }
  return wrong(exercise, expected, exercise.trapWhy);
}

export function givenToString(
  given: GradeInput["given"],
  exercise: Exercise,
): string {
  if (typeof given === "boolean") return given ? "참" : "거짓";
  if (typeof given === "number") {
    if (exercise.type === "mcq" || exercise.type === "scenario_mcq") {
      return exercise.choices[given] ?? String(given);
    }
    return String(given);
  }
  if (Array.isArray(given)) {
    return given.map((g) => `${g.leftId}=${g.rightId}`).join(",");
  }
  return normalizeAnswer(String(given));
}
