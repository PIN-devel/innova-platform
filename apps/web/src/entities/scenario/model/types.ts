export type ScenarioNote = {
  id: string;
  chapter: number;
  stem: string;
  choices: string[];
  answerIndex: number;
  rationale: string;
  tags: string[];
  choiceWhy?: Array<string | null>;
};
