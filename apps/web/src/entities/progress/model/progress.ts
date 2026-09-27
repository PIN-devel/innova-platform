import { useEffect, useState } from "react";
import type { ExerciseType } from "@/entities/bank";
import type { DailyGoalMin, FinishedSession, NoteProgress, SessionLog } from "./types";
import { addDaysKst, todayKst } from "@/shared/lib/file";

const KEY = "kb-arch.progress.v1";
const progressKey = (userId: string) => `${KEY}:${userId}`;
export type ProgressData = {
  notes: Record<string, NoteProgress>;
  wrongIds: string[];
  wrongTypes: Partial<Record<string, ExerciseType>>;
  todayDate: string;
  todayMinutes: number;
  streakDays: number;
  lastStudyDate: string;
  dailyGoalMin: DailyGoalMin;
  totalAnswered: number;
  totalCorrect: number;
  lastSession: FinishedSession | null;
  lastMock: FinishedSession | null;
  logs: SessionLog[];
};

const fresh = (): ProgressData => ({ notes: {}, wrongIds: [], wrongTypes: {}, todayDate: todayKst(), todayMinutes: 0,
  streakDays: 0, lastStudyDate: "", dailyGoalMin: 5, totalAnswered: 0, totalCorrect: 0,
  lastSession: null, lastMock: null, logs: [] });

function withoutContent(progress: ProgressData): ProgressData {
  const session = (value: FinishedSession | null): FinishedSession | null => value && ({
    sessionId: value.sessionId, kind: value.kind, title: value.kind,
    startedAt: value.startedAt, endedAt: value.endedAt, durationSec: value.durationSec,
    answers: value.answers.map((answer) => ({
      exerciseId: answer.exerciseId, noteId: answer.noteId, type: answer.type,
      chapter: answer.chapter, tags: [], correct: answer.correct,
      noteResults: answer.noteResults, ms: answer.ms, hintUsed: answer.hintUsed, at: answer.at,
      prompt: "", expected: "", given: "",
    })),
  });
  return { notes: progress.notes, wrongIds: progress.wrongIds, wrongTypes: progress.wrongTypes,
    todayDate: progress.todayDate, todayMinutes: progress.todayMinutes, streakDays: progress.streakDays,
    lastStudyDate: progress.lastStudyDate, dailyGoalMin: progress.dailyGoalMin,
    totalAnswered: progress.totalAnswered, totalCorrect: progress.totalCorrect,
    lastSession: session(progress.lastSession), lastMock: session(progress.lastMock),
    logs: progress.logs.map((log) => ({ sessionId: log.sessionId, kind: log.kind,
      startedAt: log.startedAt, endedAt: log.endedAt,
      answers: log.answers.map((answer) => ({ id: answer.id, type: answer.type,
        correct: answer.correct, noteResults: answer.noteResults, given: "", ms: answer.ms })),
    })),
  };
}

function initial(userId: string): ProgressData {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey(userId)) ?? "null") as { state?: Partial<ProgressData> } | null;
    return value?.state ? withoutContent({ ...fresh(), ...value.state }) : fresh();
  } catch { return fresh(); }
}

const DELTA: Record<ExerciseType, { correct: number; wrong: number }> = {
  pair: { correct: 1, wrong: -2 }, ox: { correct: 1, wrong: -2 },
  mcq: { correct: 3, wrong: -3 }, scenario_mcq: { correct: 3, wrong: -3 },
  cloze: { correct: 2, wrong: -3 }, short: { correct: 3, wrong: -3 },
};

export function chapterMastery(notes: ProgressData["notes"], ids: string[]): number {
  return ids.length ? Math.round(ids.reduce((sum, id) => sum + (notes[id]?.mastery ?? 0), 0) / ids.length) : 0;
}

export function useProgress(userId: string) {
  const [progress, setProgress] = useState<ProgressData>(() => initial(userId));
  useEffect(() => { localStorage.setItem(progressKey(userId), JSON.stringify({ state: withoutContent(progress), version: 1 })); }, [progress, userId]);

  const record = (session: FinishedSession) => setProgress((previous) => {
    const today = todayKst();
    const notes = { ...previous.notes };
    let wrongIds = [...previous.wrongIds];
    const wrongTypes = { ...previous.wrongTypes };
    for (const answer of session.answers) {
      for (const result of answer.noteResults ?? [{ noteId: answer.noteId, correct: answer.correct }]) {
        const old = notes[result.noteId] ?? { lastResult: null, streakWrong: 0, nextDue: today,
          mastery: 0, answered: 0, correct: 0, wrong: 0 };
        const correct = result.correct;
        const hint = Boolean(answer.hintUsed);
        const delta = correct ? (answer.type === "cloze" && hint ? 1 : DELTA[answer.type].correct) : DELTA[answer.type].wrong;
        notes[result.noteId] = {
          lastResult: correct ? (hint ? "hint" : "correct") : "wrong",
          streakWrong: correct ? 0 : old.streakWrong + 1,
          nextDue: correct ? addDaysKst(today, hint ? 2 : session.kind.startsWith("mock") ? 7 : 5) : today,
          mastery: Math.max(0, Math.min(100, old.mastery + delta)),
          answered: old.answered + 1, correct: old.correct + Number(correct), wrong: old.wrong + Number(!correct),
        };
        wrongIds = wrongIds.filter((id) => id !== result.noteId);
        delete wrongTypes[result.noteId];
        if (!correct) { wrongIds.unshift(result.noteId); wrongTypes[result.noteId] = answer.type; }
      }
    }
    const minutes = Math.max(1, Math.round(session.durationSec / 60));
    const studied = session.kind === "lesson" || session.kind === "review" || minutes >= 10 || session.answers.length >= 6;
    const continuing = previous.lastStudyDate === today || previous.lastStudyDate === addDaysKst(today, -1);
    const streakDays = studied ? previous.lastStudyDate === today ? previous.streakDays || 1 : continuing ? previous.streakDays + 1 : 1 : previous.streakDays;
    const log: SessionLog = { sessionId: session.sessionId, kind: session.kind, startedAt: session.startedAt,
      endedAt: session.endedAt, answers: session.answers.map((answer) => ({ id: answer.noteId, type: answer.type,
        correct: answer.correct, noteResults: answer.noteResults, given: answer.given, ms: answer.ms })) };
    return { ...previous, notes, wrongIds: wrongIds.slice(0, 80), wrongTypes,
      todayDate: today, todayMinutes: (previous.todayDate === today ? previous.todayMinutes : 0) + minutes,
      streakDays, lastStudyDate: studied ? today : previous.lastStudyDate,
      totalAnswered: previous.totalAnswered + session.answers.length,
      totalCorrect: previous.totalCorrect + session.answers.filter((answer) => answer.correct).length,
      lastSession: session, lastMock: session.kind.startsWith("mock") ? session : previous.lastMock,
      logs: [log, ...previous.logs].slice(0, 40) };
  });

  return { progress, record, setGoal: (goal: DailyGoalMin) => setProgress((old) => ({ ...old, dailyGoalMin: goal })),
    reset: () => setProgress(fresh()) };
}
