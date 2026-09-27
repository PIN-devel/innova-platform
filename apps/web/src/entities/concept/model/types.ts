export type NearMiss = {
  values: string[];
  message: string;
};

export type ConceptNote = {
  id: string;
  chapter: number;
  deck: string;
  term: string;
  termAliases: string[];
  definition: string;
  pairTerm?: string;
  pairDefinition?: string;
  cloze?: string;
  shortAnswer?: string;
  shortAnswerAliases?: string[];
  shortPrompt?: string;
  mcqStem?: string;
  mcqChoices?: string[];
  mcqAnswerIndex?: number;
  choiceWhy?: Array<string | null>;
  trap?: string;
  trapAnswer?: boolean;
  trapWhy?: string;
  rationale: string;
  tags: string[];
  difficulty: number;
  nearMiss?: NearMiss;
};
