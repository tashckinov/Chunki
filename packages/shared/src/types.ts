export const CEFR_LEVELS = ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] as const;
export type CEFRLevel = typeof CEFR_LEVELS[number];

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

export const TOPIC_CATEGORIES = ['Грамматика', 'Лексика', 'Использование языка', 'Понимание', 'Письмо'] as const;
export type TopicCategory = typeof TOPIC_CATEGORIES[number];

export interface TopicIdentity {
  key: string;
  title: string;
  category: TopicCategory;
  level: CEFRLevel | null;
}

export interface TopicSuggestion extends TopicIdentity {
  level: CEFRLevel;
  rationale: string;
}

export interface TopicPlanContext {
  catalog: TopicIdentity[];
  assignedKeys: string[];
  currentLevel: CEFRLevel | null;
  targetLevel: CEFRLevel;
}

export interface TopicStudyContent {
  explanation: string;
  keyPoints: string[];
  contrastExamples: { wrong: string; right: string }[];
  exampleChunks: string[];
}

// ---- grading: request payloads ----

export interface PlacementTestDefinition {
  mcq: McqQuestion[];
  readingPassage: string;
  readingQuestions: ReadingQuestion[];
  essayPrompt: string;
}

export interface PlacementTestVariant {
  id: string;
  definition: Omit<PlacementTestDefinition, 'mcq'> & { mcq: Omit<McqQuestion, 'correct'>[] };
}

export interface PlacementTestSubmission {
  variantId?: string;
  submissionId?: string;
  fromLevel: CEFRLevel | null;
  toLevel: CEFRLevel;
  purpose: string[];
  mcqAnswers: Record<number, string>; // question n -> 'A'|'B'|'C'|'D'|'—'
  open9: string;
  open10: string;
  essay: string;
}

export interface ExercisesSubmission {
  topic: TopicIdentity & { rationale: string };
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

export interface PlacementReviewItem {
  key: string;
  prompt: string;
  answer: string;
  correction: string;
  feedback?: string;
  grammar?: string;
  naturalness?: string;
}

export interface PlacementQuota {
  allowed: boolean;
  limit: number | null;
  used: number;
  resetsAt: string;
}

export interface PlacementResultSummary {
  id: string;
  variantId: string;
  level: CEFRLevel;
  goal: CEFRLevel;
  purpose: string[];
  completedAt: string;
}

export interface PlacementOverview {
  history: PlacementResultSummary[];
  quota: PlacementQuota;
}

export interface PlacementGradeResult {
  overallLevel: CEFRLevel;
  skills: SkillBar[];
  aboveLevel: string;
  belowLevel: string;
  mcqScore: { correct: number; total: number };
  openGrades: Record<number, GradeDetail>; // by reading question n
  essayGrade: GradeDetail;
  review?: PlacementReviewItem[];
  /** Weak spots chosen from the catalog when available. */
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
  model?: string;
  gradePlacementTest(input: PlacementTestSubmission, definition?: PlacementTestDefinition, plan?: TopicPlanContext): Promise<PlacementGradeResult>;
  gradeExercises(input: ExercisesSubmission, plan?: TopicPlanContext): Promise<ExercisesGradeResult>;
  generateTopicStudy(topic: TopicIdentity): Promise<TopicStudyContent>;
  generateTopicExercises(topic: ExercisesSubmission['topic']): Promise<ExerciseItem[]>;
}

// ---- production check: does a free-text answer show active use of a chunk? ----

/** Twitter-style cap on the free-text production-check answer — enforced both
 * client-side (live counter) and server-side (the actual validation). */
export const PRODUCTION_ANSWER_MAX_LENGTH = 150;

/** One phrase the learner might have used — the chunk the situation was originally written for, plus every chunk in its linked semantic group (see chunk_semantic_groups), if any. */
export interface ProductionCheckCandidateChunk {
  id: string;
  text: string;
}

export type ProductionFeedbackLanguage = 'ru' | 'en';

export interface ProductionCheckInput {
  feedbackLanguage?: ProductionFeedbackLanguage;
  situationPrompt: string;
  userAnswer: string;
  /** Always at least one entry (the original target chunk) — never empty. */
  candidateChunks: ProductionCheckCandidateChunk[];
}

export interface ProductionCheckResult {
  /** Does the answer make sense as a reply to the situation, regardless of which (if any) known phrase it used? */
  isAppropriate: boolean;
  /** The id of whichever candidateChunks entry the answer actually produced, or null if none of them was recognizably used. Must be one of the ids passed in candidateChunks. */
  usedChunkId: string | null;
  feedback: string;
}

export interface ProductionJudgeProvider {
  name: string;
  /** Which model actually answered — for admin-facing call logs. */
  model: string;
  judgeProduction(input: ProductionCheckInput): Promise<ProductionCheckResult>;
}
