import type { BankFile, Exercise, LessonSession, SessionKind } from "@/entities/bank";
import { shuffle } from "@/shared/lib/shuffle";
import {
  fallbackExercise,
  makeCloze,
  makeMcq,
  makeOx,
  makePair,
  makeScenario,
  makeShort,
} from "./from-notes";

function sessionId(): string {
  return `s-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function assembleMock(
  bank: BankFile,
  size: 10 | 40,
): LessonSession | null {
  const scenarioCount = size === 10 ? 2 : 8;
  const shortCount = size === 10 ? 1 : 4;
  const pairCount = size === 10 ? 1 : 2;
  const oxCount = size === 10 ? 1 : 4;

  const used = new Set<string>();
  const exercises: Exercise[] = [];

  const scenes = shuffle(bank.scenarios).slice(0, scenarioCount);
  for (const s of scenes) {
    exercises.push(makeScenario(s));
    used.add(s.id);
  }

  const shorts = shuffle(bank.concepts).filter((n) => !used.has(n.id)).slice(0, shortCount);
  for (const n of shorts) {
    exercises.push(makeShort(n));
    used.add(n.id);
  }

  const pairNotes = shuffle(bank.concepts).filter((n) => !used.has(n.id));
  let pairsMade = 0;
  for (const n of pairNotes) {
    if (pairsMade >= pairCount) break;
    const pair = makePair(n, bank.concepts, n.deck === "혼동짝");
    if (!pair) continue;
    exercises.push(pair);
    used.add(n.id);
    pairsMade += 1;
  }

  const oxNotes = shuffle(bank.concepts).filter(
    (n) => !used.has(n.id) && n.trap !== undefined,
  );
  let oxMade = 0;
  for (const n of oxNotes) {
    if (oxMade >= oxCount) break;
    const ox = makeOx(n);
    if (!ox) continue;
    exercises.push(ox);
    used.add(n.id);
    oxMade += 1;
  }

  const remaining = shuffle(bank.concepts).filter((n) => !used.has(n.id));
  for (const n of remaining) {
    if (exercises.length >= size) break;
    const next = makeMcq(n) ?? makeCloze(n) ?? fallbackExercise(n);
    if (!next) continue;
    exercises.push(next);
    used.add(n.id);
  }

  if (exercises.length < size) {
    for (const n of shuffle(bank.concepts)) {
      if (exercises.length >= size) break;
      const next = makeMcq(n) ?? makeShort(n);
      if (!next) continue;
      if (exercises.some((e) => e.id === next.id)) continue;
      exercises.push({ ...next, id: `${next.id}-b` });
    }
  }

  const kind: SessionKind = size === 10 ? "mock10" : "mock40";
  const shuffled = shuffle(exercises).slice(0, size);
  if (shuffled.length < size) return null;

  return {
    sessionId: sessionId(),
    kind,
    title: size === 10 ? "미니 모의 10문항" : "본시험 모의 40문항",
    startedAt: new Date().toISOString(),
    exercises: shuffled,
    timeLimitSec: size === 10 ? 15 * 60 : 60 * 60,
  };
}
