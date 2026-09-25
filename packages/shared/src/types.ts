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

export type TopicCategory = 'Грамматика' | 'Лексика' | 'Использование языка' | 'Понимание' | 'Письмо';

/** An open-ended weak spot the AI identified — either one of the ~10 handed
 * out right after the placement test, or one discovered mid-way through a
 * later topic test (e.g. wrong article usage). Not a fixed catalog: `key` is
 * an AI-generated slug, not an enum member. */
export interface TopicSuggestion {
  key: string;
  title: string;
  category: TopicCategory;
  rationale: string;
}

export interface TopicStudyContent {
  explanation: string;
  keyPoints: string[];
  contrastExamples: { wrong: string; right: string }[];
  exampleChunks: string[];
}

// ---- grading: request payloads ----

export interface PlacementTestSubmission {
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  purpose: string[];
  mcqAnswers: Record<number, string>; // question n -> 'A'|'B'|'C'|'D'|'—'
  open9: string;
  open10: string;
  essay: string;
}

export interface ExercisesSubmission {
  topic: TopicSuggestion;
  items: ExerciseItem[];
  answers: Record<number, string>; // item index -> chosen option / free text
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
  /** ~10 open-ended topics to work on next, chosen by the grader — not a fixed catalog. */
  topics: TopicSuggestion[];
}

export interface ExercisesGradeResult {
  scoreOutOf10: number;
  passed: boolean;
  verdictLabel: string;
  notes: string[];
  /** New weak spots the grader noticed in these answers, distinct from the topic being tested. */
  discoveredTopics: TopicSuggestion[];
  nextReviewInDays: number;
}

export interface GradingProvider {
  name: string;
  gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult>;
  gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult>;
  generateTopicStudy(topic: TopicSuggestion): Promise<TopicStudyContent>;
  generateTopicExercises(topic: TopicSuggestion): Promise<ExerciseItem[]>;
}

// ---- production check: does a free-text answer show active use of a chunk? ----

/** Twitter-style cap on the free-text production-check answer — enforced both
 * client-side (live counter) and server-side (the actual validation). */
export const PRODUCTION_ANSWER_MAX_LENGTH = 150;

/** Free (non-premium, non-admin) users get this many lifetime production
 * checks — enforced server-side (progress/service.ts) and shown to the user
 * client-side (DeckDoneScreen's upsell copy). One source so the two can't drift. */
export const FREE_PRODUCTION_CHECKS_LIMIT = 3;

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
