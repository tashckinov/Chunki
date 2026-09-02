export type CEFRLevel = 'A1' | 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2' | 'B2+' | 'C1';

export interface McqQuestion {
  n: number;
  q: string;
  options: string[];
  correct: 'A' | 'B' | 'C' | 'D';
}

export interface ReadingQuestion {
  n: number;
  q: string;
}

export type ExerciseItem =
  | { type: 'choice'; q: string; options: string[]; answer: string }
  | { type: 'write'; q: string; rows: number; placeholder: string };

export interface ExerciseBlock {
  key: string;
  label: string;
  meta: string;
  text?: string;
  items: ExerciseItem[];
}

export interface ProgramTopicDef {
  id: string;
  title: string;
  category: 'Грамматика' | 'Лексика' | 'Использование языка' | 'Понимание' | 'Письмо';
}

export interface ChunkCard {
  id: string;
  en: string;
  ru: string;
  ipa: string;
  kind: string;
  ex: string;
  topic: string;
  level: CEFRLevel;
  /** How this chunk differs from a similar/confusable phrase, and when to reach for it instead. */
  contrast: { phrase: string; note: string };
}

export interface ChunkDeckDef {
  id: string;
  title: string;
  level: CEFRLevel;
  category: string;
  cardIds: string[];
}

export interface ExtraTopicDef {
  key: string;
  title: string;
}

// ---- grading: request payloads ----

export interface PlacementTestSubmission {
  mcqAnswers: Record<number, string>; // question n -> 'A'|'B'|'C'|'D'|'—'
  open9: string;
  open10: string;
  essay: string;
}

export interface ExercisesSubmission {
  topicId: string;
  topicTitle: string;
  blockAnswers: {
    blockKey: string;
    choiceAnswers: Record<number, string>; // item index -> chosen option
    writeAnswers: Record<number, string>; // item index -> free text
  }[];
}

// ---- grading: structured LLM-shaped output ----

export interface GradeDetail {
  correctness: 'correct' | 'partial' | 'incorrect' | 'n/a';
  chunkUsage: string[];
  grammar: string;
  naturalness: string;
  score: number; // 0..1
  feedback: string;
  suggestedAnswer: string;
}

export interface SkillBar {
  label: string;
  tag: CEFRLevel;
  score: number; // 0..1
}

export interface PlacementGradeResult {
  overallLevel: CEFRLevel;
  skills: SkillBar[];
  aboveLevel: string;
  belowLevel: string;
  mcqScore: { correct: number; total: number };
  openGrades: Record<number, GradeDetail>; // by reading question n
  essayGrade: GradeDetail;
  weakTopicKeys: string[];
}

export interface ExercisesGradeResult {
  scoreOutOf10: number;
  verdictLabel: string;
  blockScores: { label: string; correct: number; total: number }[];
  notes: string[];
  weakTopicKeys: string[];
  nextReviewInDays: number;
}

export interface GradingProvider {
  name: string;
  gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult>;
  gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult>;
}
