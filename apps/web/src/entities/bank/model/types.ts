import type { ConceptNote } from "@/entities/concept";
import type { ScenarioNote } from "@/entities/scenario";

/** Legacy KB architecture bank schema (still accepted). */
export const BANK_SCHEMA_KB = "kb-arch-bank.v1" as const;
/** SAP Exam Drill bank schema (additive). */
export const BANK_SCHEMA_SAP = "sap-drill-bank.v1" as const;

export const BANK_SCHEMAS = [BANK_SCHEMA_KB, BANK_SCHEMA_SAP] as const;
export type BankSchemaId = (typeof BANK_SCHEMAS)[number];

/** @deprecated Prefer BANK_SCHEMA_KB / BANK_SCHEMAS — default legacy id for compat */
export const BANK_SCHEMA = BANK_SCHEMA_KB;

export type BankFile = {
  schema: BankSchemaId;
  subject: string;
  source: string;
  generatedAt: string;
  notes?: string;
  concepts: ConceptNote[];
  scenarios: ScenarioNote[];
};

export type BankLoadIssue = {
  id: string;
  reason: string;
};

export type BankLoadResult =
  | { ok: true; bank: BankFile; skipped: BankLoadIssue[]; warnings: string[] }
  | { ok: false; reason: string };

export type ExerciseType =
  | "pair"
  | "mcq"
  | "cloze"
  | "short"
  | "ox"
  | "scenario_mcq";

export type PairItem = {
  noteId: string;
  term: string;
  definition: string;
};

export type PairExercise = {
  id: string;
  type: "pair";
  noteId: string;
  noteIds: string[];
  chapter: number;
  tags: string[];
  rationale: string;
  pairs: PairItem[];
};

export type McqExercise = {
  id: string;
  type: "mcq" | "scenario_mcq";
  noteId: string;
  chapter: number;
  tags: string[];
  rationale: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  choiceWhy?: Array<string | null>;
};

export type ClozeExercise = {
  id: string;
  type: "cloze";
  noteId: string;
  chapter: number;
  tags: string[];
  rationale: string;
  template: string;
  answers: string[][];
  isList: boolean;
};

export type ShortExercise = {
  id: string;
  type: "short";
  noteId: string;
  chapter: number;
  tags: string[];
  rationale: string;
  prompt: string;
  answers: string[];
  nearMiss?: { values: string[]; message: string };
};

export type OxExercise = {
  id: string;
  type: "ox";
  noteId: string;
  chapter: number;
  tags: string[];
  rationale: string;
  statement: string;
  answer: boolean;
  trapWhy: string;
};

export type Exercise = (
  | PairExercise
  | McqExercise
  | ClozeExercise
  | ShortExercise
  | OxExercise
) & {
  /** Original wrong note; noteId still identifies the displayed content. */
  reviewSourceNoteId?: string;
};

export type SessionKind = "lesson" | "mock10" | "mock40" | "review";

export type LessonSession = {
  sessionId: string;
  kind: SessionKind;
  title: string;
  startedAt: string;
  exercises: Exercise[];
  timeLimitSec?: number;
  chapter?: number;
  tag?: string;
};
