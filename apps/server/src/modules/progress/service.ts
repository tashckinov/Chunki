import type { ProductionCheckVerdict } from '@app/shared';
import { getProductionJudgeProvider } from '../../openrouter/index.js';
import { recordAiCallLog } from '../aiLogs/repository.js';
import { findAccountStatus, incrementProductionChecksUsed } from '../users/repository.js';
import { findSituationDialogueForLearner, type SituationDialogueForLearner } from '../dialogues/service.js';
import {
  findProgress,
  upsertProgress,
  findProgressForChunks,
  findChunkWithSituationPrompts,
  findDistractorTranslations,
  type ProgressRow,
  type SituationPromptPart,
} from './repository.js';

// Free (non-premium, non-admin) users get 3 lifetime production checks —
// permanent until an admin resets production_checks_used back to 0 (see
// admin/repository.ts's resetProductionChecksUsed).
const FREE_PRODUCTION_CHECKS_LIMIT = 3;

function isPremiumActive(premiumUntil: Date | null): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}

export type SortVerdict = 'know' | 'dont' | 'bury';

export interface ProgressSummary {
  chunkId: string;
  state: string;
  timesReviewed: number;
  timesProductionAttempted: number;
  timesProductionPassed: number;
}

function toSummary(row: ProgressRow): ProgressSummary {
  return {
    chunkId: row.chunk_id,
    state: row.state,
    timesReviewed: row.times_reviewed,
    timesProductionAttempted: row.times_production_attempted,
    timesProductionPassed: row.times_production_passed,
  };
}

type DefaultProgress = Pick<ProgressRow, 'state' | 'times_reviewed' | 'times_production_attempted' | 'times_production_passed' | 'last_reviewed_at' | 'last_production_check_at'>;

const emptyRow = (): DefaultProgress => ({
  state: 'unseen',
  times_reviewed: 0,
  times_production_attempted: 0,
  times_production_passed: 0,
  last_reviewed_at: null,
  last_production_check_at: null,
});

const SORT_STATE: Record<SortVerdict, string> = { know: 'self_known', dont: 'unknown', bury: 'unsure' };
const RECOGNITION_ELIGIBLE_STATES = new Set(['unknown', 'unsure']);
const PRODUCTION_ELIGIBLE_STATES = new Set(['self_known', 'recognition_confirmed']);

export async function recordSort(userId: string, chunkId: string, verdict: SortVerdict): Promise<ProgressSummary> {
  const current = (await findProgress(userId, chunkId)) ?? emptyRow();
  const row = await upsertProgress(userId, chunkId, {
    state: SORT_STATE[verdict],
    timesReviewed: current.times_reviewed + 1,
    timesProductionAttempted: current.times_production_attempted,
    timesProductionPassed: current.times_production_passed,
    lastReviewedAt: new Date(),
    lastProductionCheckAt: null,
  });
  return toSummary(row);
}

export async function getProgressForChunks(userId: string, chunkIds: string[]): Promise<Record<string, ProgressSummary>> {
  const rows = await findProgressForChunks(userId, chunkIds);
  const out: Record<string, ProgressSummary> = {};
  for (const row of rows) out[row.chunk_id] = toSummary(row);
  return out;
}

export interface RecognitionOption {
  id: string;
  label: string;
}

export type RecognitionCheckResult =
  | { kind: 'not_found' }
  | { kind: 'wrong_state' }
  | { kind: 'ok'; chunkId: string; prompt: string; options: RecognitionOption[] };

export async function buildRecognitionCheck(userId: string, chunkId: string): Promise<RecognitionCheckResult> {
  const chunk = await findChunkWithSituationPrompts(chunkId);
  if (!chunk) return { kind: 'not_found' };

  const progress = await findProgress(userId, chunkId);
  const state = progress?.state ?? 'unseen';
  if (!RECOGNITION_ELIGIBLE_STATES.has(state)) return { kind: 'wrong_state' };

  const distractors = await findDistractorTranslations(chunkId, 'A2', 3);
  const options: RecognitionOption[] = [{ id: 'correct', label: chunk.translation }, ...distractors.map((label, i) => ({ id: `d${i}`, label }))];
  // Shuffle so the correct answer isn't always first.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return { kind: 'ok', chunkId, prompt: chunk.text, options };
}

export type RecognitionSubmitResult = { kind: 'options_mismatch' } | { kind: 'ok'; correct: boolean; progress: ProgressSummary };

export async function recordRecognitionResult(
  userId: string,
  chunkId: string,
  selectedOptionId: string,
  echoedOptions: RecognitionOption[],
): Promise<RecognitionSubmitResult> {
  const chunk = await findChunkWithSituationPrompts(chunkId);
  if (!chunk) return { kind: 'options_mismatch' };

  const selected = echoedOptions.find((o) => o.id === selectedOptionId);
  if (!selected) return { kind: 'options_mismatch' };

  const correct = selected.label === chunk.translation;
  const current = (await findProgress(userId, chunkId)) ?? emptyRow();
  const row = await upsertProgress(userId, chunkId, {
    state: correct ? 'recognition_confirmed' : current.state,
    timesReviewed: current.times_reviewed,
    timesProductionAttempted: current.times_production_attempted,
    timesProductionPassed: current.times_production_passed,
    lastReviewedAt: new Date(),
    lastProductionCheckAt: null,
  });
  return { kind: 'ok', correct, progress: toSummary(row) };
}

export interface SituationPromptPartSummary {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

function toPartSummaries(parts: SituationPromptPart[]): SituationPromptPartSummary[] {
  return parts.map((p) => ({ text: p.text, explanationRu: p.explanation_ru, explanationEn: p.explanation_en }));
}

export interface ProductionDialogueMessageSummary {
  characterName: string;
  imageUrl: string;
  side: 'left' | 'right';
  text: string;
}

export interface ProductionDialoguePayload {
  precedingMessages: ProductionDialogueMessageSummary[];
  blank: { characterName: string; imageUrl: string; side: 'left' | 'right' };
}

export type ProductionCheckAvailability =
  | { kind: 'not_found' }
  | { kind: 'wrong_state' }
  | { kind: 'unavailable' }
  | { kind: 'limit_reached' }
  | { kind: 'ok'; mode: 'situation'; chunkId: string; situationPrompt: string; situationParts: SituationPromptPartSummary[]; chunkText: string; chunkTranslation: string }
  | { kind: 'ok'; mode: 'dialogue'; chunkId: string; dialogue: ProductionDialoguePayload; chunkText: string; chunkTranslation: string };

export async function buildProductionCheck(userId: string, chunkId: string): Promise<ProductionCheckAvailability> {
  const chunk = await findChunkWithSituationPrompts(chunkId);
  if (!chunk) return { kind: 'not_found' };

  const progress = await findProgress(userId, chunkId);
  const state = progress?.state ?? 'unseen';
  if (!PRODUCTION_ELIGIBLE_STATES.has(state)) return { kind: 'wrong_state' };

  const situationDialogue = await findSituationDialogueForLearner(chunkId);
  if (!situationDialogue && chunk.situation_prompts.length === 0) return { kind: 'unavailable' };

  const account = await findAccountStatus(userId);
  if (account && !account.isAdmin && !isPremiumActive(account.premiumUntil) && account.productionChecksUsed >= FREE_PRODUCTION_CHECKS_LIMIT) {
    return { kind: 'limit_reached' };
  }

  // "Ситуация" always uses the dialogue-completion comic when the chunk has
  // one ready (mirrors handleDontKnow's "не знаю always shows the comic when
  // one exists" on the client) — falls back to the free-text situation
  // prompt only when no such comic is authored yet.
  if (situationDialogue) {
    return {
      kind: 'ok',
      mode: 'dialogue',
      chunkId,
      chunkText: chunk.text,
      chunkTranslation: chunk.translation,
      dialogue: { precedingMessages: situationDialogue.precedingMessages, blank: situationDialogue.blank },
    };
  }

  // Round-robin by attempt count, not random — cycles through every prompt
  // over repeated encounters instead of a repeat-prone random pick. Stable
  // between this GET and the matching POST (submitProductionAnswer) below,
  // since only that POST ever increments times_production_attempted.
  const index = (progress?.times_production_attempted ?? 0) % chunk.situation_prompts.length;
  const prompt = chunk.situation_prompts[index];
  return { kind: 'ok', mode: 'situation', chunkId, situationPrompt: prompt.text, situationParts: toPartSummaries(prompt.parts), chunkText: chunk.text, chunkTranslation: chunk.translation };
}

export type ProductionSubmitResult =
  | { kind: 'not_found' }
  | { kind: 'wrong_state' }
  | { kind: 'unavailable' }
  | { kind: 'limit_reached' }
  | { kind: 'ok'; verdict: ProductionCheckVerdict; feedback: string; progress: ProgressSummary; modelAnswer?: string };

const VERDICT_STATE: Record<ProductionCheckVerdict, string> = { chunk_used: 'active', meaning_only: 'passive', not_conveyed: 'unknown' };

/** Renders the dialogue's preceding lines + an instruction as the "situation" text fed to the judge — the judge interface itself stays unchanged. */
function renderDialogueSituationPrompt(dialogue: SituationDialogueForLearner, chunkText: string): string {
  const lines = dialogue.precedingMessages.map((m) => `${m.characterName}: ${m.text}`);
  const dialogueBlock = lines.length > 0 ? `Диалог:\n${lines.join('\n')}\n\n` : '';
  return `${dialogueBlock}Продолжи диалог репликой персонажа ${dialogue.blank.characterName}, естественно используя фразу «${chunkText}».`;
}

export async function submitProductionAnswer(userId: string, chunkId: string, answer: string): Promise<ProductionSubmitResult> {
  const chunk = await findChunkWithSituationPrompts(chunkId);
  if (!chunk) return { kind: 'not_found' };

  const current = (await findProgress(userId, chunkId)) ?? emptyRow();
  if (!PRODUCTION_ELIGIBLE_STATES.has(current.state)) return { kind: 'wrong_state' };

  const situationDialogue = await findSituationDialogueForLearner(chunkId);
  if (!situationDialogue && chunk.situation_prompts.length === 0) return { kind: 'unavailable' };

  const account = await findAccountStatus(userId);
  const isFree = !!account && !account.isAdmin && !isPremiumActive(account.premiumUntil);
  if (account && isFree && account.productionChecksUsed >= FREE_PRODUCTION_CHECKS_LIMIT) return { kind: 'limit_reached' };

  const situationPromptText = situationDialogue
    ? renderDialogueSituationPrompt(situationDialogue, chunk.text)
    : chunk.situation_prompts[current.times_production_attempted % chunk.situation_prompts.length].text;

  const judge = getProductionJudgeProvider();
  const judgeInput = {
    chunkText: chunk.text,
    chunkTranslation: chunk.translation,
    chunkExample: chunk.example,
    situationPrompt: situationPromptText,
    userAnswer: answer,
  };
  const startedAt = Date.now();
  let result;
  try {
    result = await judge.judgeProduction(judgeInput);
  } catch (err) {
    await recordAiCallLog({
      userId,
      chunkId,
      provider: judge.name,
      model: judge.model,
      request: judgeInput,
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    }).catch(() => {});
    throw err;
  }
  await recordAiCallLog({
    userId,
    chunkId,
    provider: judge.name,
    model: judge.model,
    request: judgeInput,
    response: result,
    error: null,
    durationMs: Date.now() - startedAt,
  }).catch(() => {});

  if (isFree) await incrementProductionChecksUsed(userId).catch(() => {});

  const row = await upsertProgress(userId, chunkId, {
    state: VERDICT_STATE[result.verdict],
    timesReviewed: current.times_reviewed,
    timesProductionAttempted: current.times_production_attempted + 1,
    timesProductionPassed: current.times_production_passed + (result.verdict === 'chunk_used' ? 1 : 0),
    lastReviewedAt: current.last_reviewed_at ?? null,
    lastProductionCheckAt: new Date(),
  });

  return { kind: 'ok', verdict: result.verdict, feedback: result.feedback, progress: toSummary(row), modelAnswer: situationDialogue?.modelAnswer };
}
