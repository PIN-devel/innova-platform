import { z } from "zod";

const nearMiss = z.object({ values: z.array(z.string()).min(1), message: z.string().min(1) });

export const ExamConceptSchema = z.object({
  id: z.string().min(1), chapter: z.number().int().positive(), deck: z.string().min(1),
  term: z.string().min(1), termAliases: z.array(z.string()).default([]),
  definition: z.string().min(1), pairTerm: z.string().optional(), pairDefinition: z.string().optional(),
  cloze: z.string().optional(), shortAnswer: z.string().optional(),
  shortAnswerAliases: z.array(z.string()).optional(), shortPrompt: z.string().optional(),
  mcqStem: z.string().optional(), mcqChoices: z.array(z.string()).optional(),
  mcqAnswerIndex: z.number().int().optional(), choiceWhy: z.array(z.string().nullable()).optional(),
  trap: z.string().optional(), trapAnswer: z.boolean().optional(), trapWhy: z.string().optional(),
  rationale: z.string().min(1), tags: z.array(z.string()).default([]),
  difficulty: z.number().int().min(1).max(3).default(1), nearMiss: nearMiss.optional(),
}).superRefine((value, context) => {
  if (value.mcqChoices && (value.mcqAnswerIndex === undefined || value.mcqAnswerIndex < 0 || value.mcqAnswerIndex >= value.mcqChoices.length)) {
    context.addIssue({ code: "custom", message: "Invalid MCQ answer index" });
  }
  if (value.choiceWhy && value.mcqChoices && value.choiceWhy.length !== value.mcqChoices.length) {
    context.addIssue({ code: "custom", message: "Choice explanations do not match choices" });
  }
});

export const ExamScenarioSchema = z.object({
  id: z.string().min(1), chapter: z.number().int().positive(), stem: z.string().min(1),
  choices: z.array(z.string()).min(3), answerIndex: z.number().int().min(0),
  rationale: z.string().min(1), tags: z.array(z.string()).default([]),
  choiceWhy: z.array(z.string().nullable()).optional(),
}).superRefine((value, context) => {
  if (value.answerIndex >= value.choices.length) context.addIssue({ code: "custom", message: "Invalid scenario answer index" });
  if (value.choiceWhy && value.choiceWhy.length !== value.choices.length) context.addIssue({ code: "custom", message: "Choice explanations do not match choices" });
});

export const ExamBankSchema = z.object({
  schema: z.enum(["kb-arch-bank.v1", "sap-drill-bank.v1"]),
  subject: z.string().min(1), source: z.string().min(1), generatedAt: z.string().min(1),
  notes: z.string().optional(), concepts: z.array(ExamConceptSchema), scenarios: z.array(ExamScenarioSchema),
}).superRefine((value, context) => {
  const ids = [...value.concepts, ...value.scenarios].map((note) => note.id);
  if (ids.length === 0) context.addIssue({ code: "custom", message: "Bank is empty" });
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate note id" });
});

export const ExamBankRecordSchema = z.object({ id: z.string(), bank: ExamBankSchema });
export type ExamConcept = z.infer<typeof ExamConceptSchema>;
export type ExamScenario = z.infer<typeof ExamScenarioSchema>;
export type ExamBank = z.infer<typeof ExamBankSchema>;
export type ExamBankRecord = z.infer<typeof ExamBankRecordSchema>;
