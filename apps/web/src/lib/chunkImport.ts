import type { ChunkSentence, ChunkSentencePart } from './collections';

export type ValidateSentencesResult = { kind: 'ok'; sentences: ChunkSentence[] } | { kind: 'error'; message: string };

/** Shared by both the bulk-create and bulk-regenerate parsers below — validates one chunk's `sentences` array shape. */
export function validateSentencesShape(raw: unknown): ValidateSentencesResult {
  if (!Array.isArray(raw)) {
    return { kind: 'error', message: 'sentences должно быть массивом.' };
  }
  const sentences: ChunkSentence[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      return { kind: 'error', message: 'Каждое предложение должно быть объектом.' };
    }
    const { text, translation, parts } = item as { text?: unknown; translation?: unknown; parts?: unknown };
    if (typeof text !== 'string' || !text.trim() || typeof translation !== 'string' || !translation.trim()) {
      return { kind: 'error', message: 'У каждого предложения должны быть непустые text и translation.' };
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      return { kind: 'error', message: `У предложения "${text}" должна быть хотя бы одна часть (parts).` };
    }
    const validParts: ChunkSentencePart[] = [];
    for (const p of parts) {
      if (typeof p !== 'object' || p === null) {
        return { kind: 'error', message: `Каждая часть предложения "${text}" должна быть объектом.` };
      }
      const { text: partText, explanationRu, explanationEn } = p as { text?: unknown; explanationRu?: unknown; explanationEn?: unknown };
      if (typeof partText !== 'string' || !partText.trim() || typeof explanationRu !== 'string' || !explanationRu.trim() || typeof explanationEn !== 'string' || !explanationEn.trim()) {
        return { kind: 'error', message: `У каждой части предложения "${text}" должны быть непустые text, explanationRu и explanationEn.` };
      }
      validParts.push({ text: partText, explanationRu, explanationEn });
    }
    sentences.push({ text, translation, parts: validParts });
  }
  return { kind: 'ok', sentences };
}

export interface ParsedChunkCreate {
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  situationPrompts: string[];
  sentences: ChunkSentence[];
}

export type ParseBulkChunkCreateResult = { kind: 'ok'; chunks: ParsedChunkCreate[] } | { kind: 'error'; message: string };

/** Parses a { chunks: [...] } payload for the bulk "create new chunks via AI" flow. */
export function parseBulkChunkCreateImport(text: string): ParseBulkChunkCreateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { chunks?: unknown }).chunks)) {
    return { kind: 'error', message: 'Ожидается объект с полем chunks (массив).' };
  }
  const items = (raw as { chunks: unknown[] }).chunks;
  if (items.length === 0) {
    return { kind: 'error', message: 'В chunks нет ни одного чанка.' };
  }

  const result: ParsedChunkCreate[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      return { kind: 'error', message: 'Каждый чанк должен быть объектом.' };
    }
    const { text: chunkText, translation, explanation, level, situationPrompts, sentences } = item as Record<string, unknown>;
    if (typeof chunkText !== 'string' || !chunkText.trim() || typeof translation !== 'string' || !translation.trim() || typeof level !== 'string' || !level.trim()) {
      return { kind: 'error', message: 'У каждого чанка должны быть непустые text, translation и level.' };
    }
    const sentencesResult = validateSentencesShape(sentences ?? []);
    if (sentencesResult.kind === 'error') {
      return { kind: 'error', message: `«${chunkText}»: ${sentencesResult.message}` };
    }
    const prompts = Array.isArray(situationPrompts) ? situationPrompts.filter((p): p is string => typeof p === 'string' && !!p.trim()) : [];
    result.push({
      text: chunkText,
      translation,
      explanation: typeof explanation === 'string' && explanation.trim() ? explanation : null,
      level,
      situationPrompts: prompts,
      sentences: sentencesResult.sentences,
    });
  }
  return { kind: 'ok', chunks: result };
}

export interface BulkParsedSentences {
  chunkId: string;
  sentences: ChunkSentence[];
}

export type ParseBulkSentencesResult = { kind: 'ok'; items: BulkParsedSentences[] } | { kind: 'error'; message: string };

/** Parses a { sentencesByChunk: [...] } payload for the bulk "regenerate sentences" flow, keyed by existing chunk ids. */
export function parseBulkSentencesImport(text: string, chunks: { id: string; text: string }[]): ParseBulkSentencesResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { sentencesByChunk?: unknown }).sentencesByChunk)) {
    return { kind: 'error', message: 'Ожидается объект с полем sentencesByChunk (массив).' };
  }
  const items = (raw as { sentencesByChunk: unknown[] }).sentencesByChunk;
  if (items.length === 0) {
    return { kind: 'error', message: 'В sentencesByChunk нет ни одного элемента.' };
  }

  const chunkIds = new Set(chunks.map((c) => c.id));
  const seen = new Set<string>();
  const result: BulkParsedSentences[] = [];
  for (const item of items) {
    const chunkId = (item as { chunkId?: unknown })?.chunkId;
    if (typeof chunkId !== 'string' || !chunkIds.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${String(chunkId)} не относится к этой коллекции.` };
    }
    if (seen.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${chunkId} встречается в sentencesByChunk дважды.` };
    }
    seen.add(chunkId);
    const sentencesResult = validateSentencesShape((item as { sentences?: unknown }).sentences);
    if (sentencesResult.kind === 'error') {
      const chunkText = chunks.find((c) => c.id === chunkId)?.text ?? chunkId;
      return { kind: 'error', message: `«${chunkText}»: ${sentencesResult.message}` };
    }
    result.push({ chunkId, sentences: sentencesResult.sentences });
  }
  return { kind: 'ok', items: result };
}
