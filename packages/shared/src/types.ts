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

// ---- production check: does a free-text answer show active use of a chunk? ----

/** Twitter-style cap on the free-text production-check answer — enforced both
 * client-side (live counter) and server-side (the actual validation). */
export const PRODUCTION_ANSWER_MAX_LENGTH = 150;

export interface ProductionCheckInput {
  chunkText: string;
  chunkTranslation: string;
  chunkExample: string | null;
  situationPrompt: string;
  userAnswer: string;
}

export type ProductionCheckVerdict = 'chunk_used' | 'meaning_only' | 'not_conveyed';

export interface ProductionCheckResult {
  verdict: ProductionCheckVerdict;
  feedback: string;
}

export interface ProductionJudgeProvider {
  name: string;
  /** Which model actually answered — for admin-facing call logs. */
  model: string;
  judgeProduction(input: ProductionCheckInput): Promise<ProductionCheckResult>;
}
