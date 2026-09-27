import type { ExerciseType, SessionKind } from "@/entities/bank";

export type NoteProgress = {
  lastResult: "correct" | "wrong" | "hint" | "nearMiss" | null;
  streakWrong: number;
  nextDue: string;
  mastery: number;
  answered: number;
  correct: number;
  wrong: number;
};

export type NoteResult = { noteId: string; correct: boolean };

export type SessionAnswer = {
  exerciseId: string;
  noteId: string;
  type: ExerciseType;
  chapter: number;
  tags: string[];
  prompt: string;
  correct: boolean;
  /** Progress targets, including individual pair links and review origins. */
  noteResults?: NoteResult[];
  given: string;
  expected: string;
  ms: number;
  hintUsed?: boolean;
  at: string;
};

export type FinishedSession = {
  sessionId: string;
  kind: SessionKind;
  title: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  answers: SessionAnswer[];
};

export type SessionLog = {
  sessionId: string;
  kind: SessionKind;
  startedAt: string;
  endedAt: string;
  answers: Array<{
    id: string;
    type: ExerciseType;
    correct: boolean;
    noteResults?: NoteResult[];
    given: string;
    ms: number;
  }>;
};

export type DailyGoalMin = 5 | 15;
