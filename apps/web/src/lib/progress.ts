import { getJson, postJson } from './collections';

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

export type ProductionCheckAvailability =
  | { available: false; reason?: 'limit_reached' }
  | { available: true; chunkId: string; situationPrompt: string; situationParts: SituationPromptPart[]; chunkText: string; chunkTranslation: string };

export type ProductionVerdict = 'chunk_used' | 'meaning_only' | 'not_conveyed';

export interface ProductionCheckResult {
  verdict: ProductionVerdict;
  feedback: string;
  progress: ProgressSummary;
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
