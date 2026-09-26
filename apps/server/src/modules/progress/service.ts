import type { ProductionCheckCandidateChunk } from '@app/shared';
import { getProductionJudgeProvider } from '../../openrouter/index.js';
import { withAiCallLogging } from '../aiLogs/service.js';
import { findAccountStatus, bumpDailyChecksUsed } from '../users/repository.js';
import { resolveEffectiveTariff, effectiveDailyChecksUsed, listUpsellTariffs, type PublicTariff } from '../subscriptionTariffs/service.js';
import { findSituationDialogueForLearner, type SituationDialogueForLearner } from '../dialogues/service.js';
import { listGroupMemberChunksBasic } from '../chunkGroups/service.js';
import {
  findProgress,
  upsertProgress,
  findProgressForChunks,
  findChunkWithSituationPrompts,
  findDistractorTranslations,
  type ProgressRow,
  type SituationPromptPart,
} from './repository.js';

// A situation's candidate list is [its own chunk] plus every member of its
// linked semantic group, if any — capped for judge-prompt economy. Typical
// groups (accepting_suggestion et al.) are a handful of phrases; this is a
// safety net, not a realistic limit.
const MAX_CANDIDATE_CHUNKS = 25;

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
  | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] }
  | { kind: 'limit_reached'; upsellTariffs: PublicTariff[] }
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

  const tariff = await resolveEffectiveTariff(userId);
  if (!tariff.unrestricted && !tariff.allowCards) {
    return { kind: 'not_allowed', upsellTariffs: await listUpsellTariffs(tariff.id) };
  }
  if (!tariff.unrestricted && tariff.dailyCheckLimit !== null) {
    const account = await findAccountStatus(userId);
    const used = account ? effectiveDailyChecksUsed(account.dailyChecksUsed, account.dailyChecksDate) : 0;
    if (used >= tariff.dailyCheckLimit) {
      return { kind: 'limit_reached', upsellTariffs: await listUpsellTariffs(tariff.id) };
    }
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
  | { kind: 'not_allowed'; upsellTariffs: PublicTariff[] }
  | { kind: 'limit_reached'; upsellTariffs: PublicTariff[] }
  | { kind: 'ok'; isAppropriate: boolean; usedChunkId: string | null; usedChunkText: string | null; feedback: string; progress: ProgressSummary; modelAnswer?: string };

/** Renders the dialogue's preceding lines + an instruction as the "situation" text fed to the judge — deliberately doesn't name any phrase (see buildCandidateChunks: the judge is given the actual candidate list separately, not told which one to expect via the prompt text). */
function renderDialogueSituationPrompt(dialogue: SituationDialogueForLearner): string {
  const lines = dialogue.precedingMessages.map((m) => `${m.characterName}: ${m.text}`);
  const dialogueBlock = lines.length > 0 ? `Диалог:\n${lines.join('\n')}\n\n` : '';
  return `${dialogueBlock}Продолжи диалог естественной репликой персонажа ${dialogue.blank.characterName}.`;
}

/** [the situation's own chunk, ...its linked semantic group's members], deduped and capped — the judge's full set of "known phrases that would answer this". Null expectedGroupId (not yet classified) just falls back to the single original chunk, same as before this feature. */
async function buildCandidateChunks(chunkId: string, chunkText: string, expectedGroupId: string | null): Promise<ProductionCheckCandidateChunk[]> {
  const candidates: ProductionCheckCandidateChunk[] = [{ id: chunkId, text: chunkText }];
  if (!expectedGroupId) return candidates;

  const seen = new Set([chunkId]);
  for (const member of await listGroupMemberChunksBasic(expectedGroupId)) {
    if (seen.has(member.id) || candidates.length >= MAX_CANDIDATE_CHUNKS) continue;
    candidates.push({ id: member.id, text: member.text });
    seen.add(member.id);
  }
  return candidates;
}

export async function submitProductionAnswer(userId: string, chunkId: string, answer: string): Promise<ProductionSubmitResult> {
  const chunk = await findChunkWithSituationPrompts(chunkId);
  if (!chunk) return { kind: 'not_found' };

  const current = (await findProgress(userId, chunkId)) ?? emptyRow();
  if (!PRODUCTION_ELIGIBLE_STATES.has(current.state)) return { kind: 'wrong_state' };

  const situationDialogue = await findSituationDialogueForLearner(chunkId);
  if (!situationDialogue && chunk.situation_prompts.length === 0) return { kind: 'unavailable' };

  const tariff = await resolveEffectiveTariff(userId);
  if (!tariff.unrestricted && !tariff.allowCards) {
    return { kind: 'not_allowed', upsellTariffs: await listUpsellTariffs(tariff.id) };
  }
  let countsTowardDailyLimit = false;
  if (!tariff.unrestricted && tariff.dailyCheckLimit !== null) {
    const account = await findAccountStatus(userId);
    const used = account ? effectiveDailyChecksUsed(account.dailyChecksUsed, account.dailyChecksDate) : 0;
    if (used >= tariff.dailyCheckLimit) return { kind: 'limit_reached', upsellTariffs: await listUpsellTariffs(tariff.id) };
    countsTowardDailyLimit = true;
  }

  let situationPromptText: string;
  let expectedGroupId: string | null;
  if (situationDialogue) {
    situationPromptText = renderDialogueSituationPrompt(situationDialogue);
    expectedGroupId = situationDialogue.expectedGroupId;
  } else {
    const prompt = chunk.situation_prompts[current.times_production_attempted % chunk.situation_prompts.length];
    situationPromptText = prompt.text;
    expectedGroupId = prompt.expected_group_id;
  }

  const candidateChunks = await buildCandidateChunks(chunkId, chunk.text, expectedGroupId);

  const judge = getProductionJudgeProvider();
  const judgeInput = { situationPrompt: situationPromptText, userAnswer: answer, candidateChunks };
  const result = await withAiCallLogging({ userId, chunkId, provider: judge.name, model: judge.model, request: judgeInput }, () => judge.judgeProduction(judgeInput));

  // This increment IS the daily-limit enforcement — if it fails, the limit
  // silently doesn't apply (the judge call above already happened, so
  // there's nothing to roll back), which is worth a visible log line rather
  // than vanishing entirely.
  if (countsTowardDailyLimit) {
    await bumpDailyChecksUsed(userId).catch((err) => {
      console.error('bumpDailyChecksUsed failed', { userId, message: err instanceof Error ? err.message : String(err) });
    });
  }

  // Defensive re-validation — only ever credit an id the judge was actually
  // given, never one it might have hallucinated.
  const creditedChunkId = result.usedChunkId && candidateChunks.some((c) => c.id === result.usedChunkId) ? result.usedChunkId : null;

  let progressRow: ProgressRow;
  if (creditedChunkId) {
    // A full pass — but credited to whichever chunk was actually produced,
    // which may be a different card than the one this check was launched
    // for (a sibling in the same semantic group). That sibling's own
    // progress row is read/written here; the originally-requested chunkId's
    // progress is deliberately left untouched in this branch.
    const creditedCurrent = creditedChunkId === chunkId ? current : ((await findProgress(userId, creditedChunkId)) ?? emptyRow());
    progressRow = await upsertProgress(userId, creditedChunkId, {
      state: 'active',
      timesReviewed: creditedCurrent.times_reviewed,
      timesProductionAttempted: creditedCurrent.times_production_attempted + 1,
      timesProductionPassed: creditedCurrent.times_production_passed + 1,
      lastReviewedAt: creditedCurrent.last_reviewed_at ?? null,
      lastProductionCheckAt: new Date(),
    });
  } else {
    // No known phrase recognized — the attempt still counts against the
    // originally-requested card (so its situation-prompt round-robin keeps
    // advancing), just without a pass.
    progressRow = await upsertProgress(userId, chunkId, {
      state: result.isAppropriate ? 'passive' : 'unknown',
      timesReviewed: current.times_reviewed,
      timesProductionAttempted: current.times_production_attempted + 1,
      timesProductionPassed: current.times_production_passed,
      lastReviewedAt: current.last_reviewed_at ?? null,
      lastProductionCheckAt: new Date(),
    });
  }

  const usedChunkText = creditedChunkId ? (candidateChunks.find((c) => c.id === creditedChunkId)?.text ?? null) : null;

  return {
    kind: 'ok',
    isAppropriate: result.isAppropriate,
    usedChunkId: creditedChunkId,
    usedChunkText,
    feedback: result.feedback,
    progress: toSummary(progressRow),
    modelAnswer: situationDialogue?.modelAnswer,
  };
}
