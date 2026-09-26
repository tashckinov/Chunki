import { getJson, postJson } from './collections';
import type { Tariff } from './payments';

export type SortVerdict = 'know' | 'dont' | 'bury';

export interface ProgressSummary {
  chunkId: string;
  state: string;
  timesReviewed: number;
  timesProductionAttempted: number;
  timesProductionPassed: number;
}

export interface RecognitionOption {
  id: string;
  label: string;
}

export interface RecognitionCheck {
  chunkId: string;
  prompt: string;
  options: RecognitionOption[];
}

export interface SituationPromptPart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

export interface ProductionDialogueMessage {
  characterName: string;
  imageUrl: string;
  side: 'left' | 'right';
  text: string;
}

export interface ProductionDialoguePayload {
  precedingMessages: ProductionDialogueMessage[];
  blank: { characterName: string; imageUrl: string; side: 'left' | 'right' };
}

export type ProductionCheckAvailability =
  | { available: false; reason?: 'limit_reached' | 'not_allowed'; upsellTariffs?: Tariff[] }
  | { available: true; mode: 'situation'; chunkId: string; situationPrompt: string; situationParts: SituationPromptPart[]; chunkText: string; chunkTranslation: string }
  | { available: true; mode: 'dialogue'; chunkId: string; dialogue: ProductionDialoguePayload; chunkText: string; chunkTranslation: string };

export interface ProductionCheckResult {
  /** Does the answer make sense as a reply to the situation, regardless of which (if any) known phrase it used? */
  isAppropriate: boolean;
  /** Which chunk (possibly a different one than the card this check was launched for, if it's in the same semantic group) actually got progress credit — null if none was recognized. */
  usedChunkId: string | null;
  usedChunkText: string | null;
  feedback: string;
  /** Progress of whichever chunk actually got credited — usedChunkId if set, otherwise the originally-requested chunk (not-passed attempt). */
  progress: ProgressSummary;
  /** The "Ситуация" comic's hidden line, revealed once the learner has answered — absent for the free-text situation-prompt flow. */
  modelAnswer?: string;
}

export async function postSort(chunkId: string, verdict: SortVerdict): Promise<ProgressSummary> {
  const data = await postJson<{ progress: ProgressSummary }>('/api/progress/sort', { chunkId, verdict });
  return data.progress;
}

export async function getRecognitionCheck(chunkId: string): Promise<RecognitionCheck> {
  return getJson<RecognitionCheck>(`/api/progress/recognition-check/${chunkId}`);
}

export async function postRecognitionCheck(
  chunkId: string,
  selectedOptionId: string,
  options: RecognitionOption[],
): Promise<{ correct: boolean; progress: ProgressSummary }> {
  return postJson(`/api/progress/recognition-check/${chunkId}`, { selectedOptionId, options });
}

export async function getProductionCheck(chunkId: string): Promise<ProductionCheckAvailability> {
  return getJson<ProductionCheckAvailability>(`/api/progress/production-check/${chunkId}`);
}

export async function postProductionCheck(chunkId: string, answer: string): Promise<ProductionCheckResult> {
  return postJson(`/api/progress/production-check/${chunkId}`, { answer });
}

export async function getProgressForChunks(chunkIds: string[]): Promise<Record<string, ProgressSummary>> {
  if (chunkIds.length === 0) return {};
  const data = await getJson<{ progress: Record<string, ProgressSummary> }>(`/api/progress?chunkIds=${chunkIds.join(',')}`);
  return data.progress;
}
