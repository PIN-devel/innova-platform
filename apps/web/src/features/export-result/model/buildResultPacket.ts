import type { BankFile } from "@/entities/bank";
import { UNITS } from "@/entities/bank";
import type { FinishedSession, NoteProgress, SessionLog } from "@/entities/progress";
import { chapterMastery } from "@/entities/progress";

export const RESULT_SCHEMA = "kb-arch-result.v1" as const;

export type ResultRange = "today" | "last-mock" | "weakness-pack";

type ProgressSlice = {
  notes: Record<string, NoteProgress>;
  wrongIds: string[];
  streakDays: number;
  totalAnswered: number;
  totalCorrect: number;
  lastSession: FinishedSession | null;
  lastMock: FinishedSession | null;
  logs: SessionLog[];
};

export function buildResultPacket(
  bank: BankFile,
  progress: ProgressSlice,
  range: ResultRange,
) {
  const overallAccuracy =
    progress.totalAnswered === 0
      ? 0
      : Number((progress.totalCorrect / progress.totalAnswered).toFixed(2));

  const chapterMasteryList = UNITS.map((ch) => {
    const ids = [
      ...bank.concepts.filter((n) => n.chapter === ch.id).map((n) => n.id),
      ...bank.scenarios.filter((n) => n.chapter === ch.id).map((n) => n.id),
    ];
    const answered = ids.reduce(
      (acc, id) => acc + (progress.notes[id]?.answered ?? 0),
      0,
    );
    const correct = ids.reduce(
      (acc, id) => acc + (progress.notes[id]?.correct ?? 0),
      0,
    );
    const wrong = ids.reduce(
      (acc, id) => acc + (progress.notes[id]?.wrong ?? 0),
      0,
    );
    return {
      chapter: ch.id,
      mastery: chapterMastery(progress.notes, ids),
      accuracy: answered ? Number((correct / answered).toFixed(2)) : 0,
      wrong,
    };
  });

  const tagStats = new Map<string, { wrong: number; answered: number }>();
  const bump = (tags: string[], wrong: boolean) => {
    for (const tag of tags) {
      const prev = tagStats.get(tag) ?? { wrong: 0, answered: 0 };
      tagStats.set(tag, {
        answered: prev.answered + 1,
        wrong: prev.wrong + (wrong ? 1 : 0),
      });
    }
  };

  const sourceAnswers =
    range === "last-mock"
      ? (progress.lastMock?.answers ?? [])
      : range === "today"
        ? (progress.lastSession?.answers ?? []).filter((a) => {
            const day = a.at.slice(0, 10);
            const today = new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Seoul",
            });
            return day === today || a.at.startsWith(today);
          })
        : [];

  if (range === "weakness-pack") {
    for (const note of bank.concepts) {
      const p = progress.notes[note.id];
      if (!p) continue;
      for (let i = 0; i < p.answered; i += 1) {
        bump(note.tags, i < p.wrong);
      }
    }
  } else {
    for (const a of sourceAnswers) bump(a.tags, !a.correct);
  }

  const weakTags = [...tagStats.entries()]
    .map(([tag, v]) => ({ tag, ...v }))
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 12);

  let wrongItems =
    range === "last-mock"
      ? (progress.lastMock?.answers ?? []).filter((a) => !a.correct)
      : range === "today"
        ? (progress.lastSession?.answers ?? []).filter((a) => !a.correct)
        : (progress.lastSession?.answers ?? [])
            .concat(progress.lastMock?.answers ?? [])
            .filter((a) => !a.correct);

  if (range === "weakness-pack" && wrongItems.length === 0) {
    wrongItems = (progress.lastSession?.answers ?? []).filter((a) => !a.correct);
  }

  const uniqueWrong = [];
  const seen = new Set<string>();
  for (const item of wrongItems) {
    const key = `${item.noteId}:${item.type}:${item.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueWrong.push({
      id: item.noteId,
      ...(item.noteResults ? { noteResults: item.noteResults } : {}),
      type: item.type,
      chapter: item.chapter,
      tags: item.tags,
      prompt: item.prompt,
      correct: item.expected,
      given: item.given,
      at: item.at,
    });
    if (uniqueWrong.length >= 30) break;
  }

  const lastMock = progress.lastMock;
  const byChapter = lastMock
    ? UNITS.map((ch) => {
        const items = lastMock.answers.filter((a) => a.chapter === ch.id);
        if (!items.length) return null;
        return {
          chapter: ch.id,
          correct: items.filter((a) => a.correct).length,
          total: items.length,
        };
      }).filter((x): x is NonNullable<typeof x> => Boolean(x))
    : [];

  const focusTags = weakTags.slice(0, 4).map((t) => t.tag);

  return {
    schema: RESULT_SCHEMA,
    subject: bank.subject,
    exportedAt: new Date().toISOString(),
    range,
    profile: {
      streakDays: progress.streakDays,
      totalAnswered: progress.totalAnswered,
      overallAccuracy,
      chapterMastery: chapterMasteryList,
    },
    lastMock: lastMock
      ? {
          mode: lastMock.kind === "mock40" ? "mock40" : "mini10",
          startedAt: lastMock.startedAt,
          durationSec: lastMock.durationSec,
          score: lastMock.answers.filter((a) => a.correct).length,
          total: lastMock.answers.length,
          byChapter,
        }
      : null,
    weakTags,
    wrongItems: uniqueWrong,
    requestToTutor: {
      action: "generate-notes",
      focusTags,
      count: 15,
      preferTypes: ["short", "scenario_mcq"],
      instruction:
        "틀린 항목의 인접 함정 보기를 포함해 ConceptNote JSON만 출력할 것",
    },
  };
}

export const TUTOR_PROMPT = `아래는 드릴 앱 result.json이다.
weakTags와 wrongItems만 근거로 약점을 진단하고,
requestToTutor대로 sap-drill-bank.v1 또는 kb-arch-bank.v1 형식의 보강 노트 JSON만 출력해라.
설명은 짧게, 교재 밖 단정은 하지 마라.`;
