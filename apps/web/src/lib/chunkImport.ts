import type { ChunkSentence, ChunkSentencePart, SituationPrompt } from './collections';

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

export type ValidateSituationsResult = { kind: 'ok'; situations: SituationPrompt[] } | { kind: 'error'; message: string };

/** Same idea as validateSentencesShape above, but for situation prompts (no translation field). */
export function validateSituationsShape(raw: unknown): ValidateSituationsResult {
  if (!Array.isArray(raw)) {
    return { kind: 'error', message: 'situations должно быть массивом.' };
  }
  const situations: SituationPrompt[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      return { kind: 'error', message: 'Каждая ситуация должна быть объектом.' };
    }
    const { text, parts } = item as { text?: unknown; parts?: unknown };
    if (typeof text !== 'string' || !text.trim()) {
      return { kind: 'error', message: 'У каждой ситуации должен быть непустой text.' };
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      return { kind: 'error', message: `У ситуации "${text}" должна быть хотя бы одна часть (parts).` };
    }
    const validParts: ChunkSentencePart[] = [];
    for (const p of parts) {
      if (typeof p !== 'object' || p === null) {
        return { kind: 'error', message: `Каждая часть ситуации "${text}" должна быть объектом.` };
      }
      const { text: partText, explanationRu, explanationEn } = p as { text?: unknown; explanationRu?: unknown; explanationEn?: unknown };
      if (typeof partText !== 'string' || !partText.trim() || typeof explanationRu !== 'string' || !explanationRu.trim() || typeof explanationEn !== 'string' || !explanationEn.trim()) {
        return { kind: 'error', message: `У каждой части ситуации "${text}" должны быть непустые text, explanationRu и explanationEn.` };
      }
      validParts.push({ text: partText, explanationRu, explanationEn });
    }
    situations.push({ text, parts: validParts });
  }
  return { kind: 'ok', situations };
}

export interface BulkParsedSituations {
  chunkId: string;
  situations: SituationPrompt[];
}

export type ParseBulkSituationsResult = { kind: 'ok'; items: BulkParsedSituations[] } | { kind: 'error'; message: string };

/** Parses a { situationsByChunk: [...] } payload for the bulk "regenerate situations" flow, keyed by existing chunk ids. */
export function parseBulkSituationsImport(text: string, chunks: { id: string; text: string }[]): ParseBulkSituationsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'Не удалось разобрать JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { situationsByChunk?: unknown }).situationsByChunk)) {
    return { kind: 'error', message: 'Ожидается объект с полем situationsByChunk (массив).' };
  }
  const items = (raw as { situationsByChunk: unknown[] }).situationsByChunk;
  if (items.length === 0) {
    return { kind: 'error', message: 'В situationsByChunk нет ни одного элемента.' };
  }

  const chunkIds = new Set(chunks.map((c) => c.id));
  const seen = new Set<string>();
  const result: BulkParsedSituations[] = [];
  for (const item of items) {
    const chunkId = (item as { chunkId?: unknown })?.chunkId;
    if (typeof chunkId !== 'string' || !chunkIds.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${String(chunkId)} не относится к этой коллекции.` };
    }
    if (seen.has(chunkId)) {
      return { kind: 'error', message: `chunkId ${chunkId} встречается в situationsByChunk дважды.` };
    }
    seen.add(chunkId);
    const situationsResult = validateSituationsShape((item as { situations?: unknown }).situations);
    if (situationsResult.kind === 'error') {
      const chunkText = chunks.find((c) => c.id === chunkId)?.text ?? chunkId;
      return { kind: 'error', message: `«${chunkText}»: ${situationsResult.message}` };
    }
    result.push({ chunkId, situations: situationsResult.situations });
  }
  return { kind: 'ok', items: result };
}

export interface ParsedChunkCreate {
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  situationPrompts: SituationPrompt[];
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
    // The bulk-create prompt still asks the AI for flat situationPrompts strings (a
    // minor, optional field here) — wrap each into the {text, parts} shape the admin
    // API expects, with zero parts (a real breakdown only comes from the dedicated
    // bulk-situations-regenerate flow, which asks for the full nested shape).
    const prompts: SituationPrompt[] = Array.isArray(situationPrompts)
      ? situationPrompts.filter((p): p is string => typeof p === 'string' && !!p.trim()).map((text) => ({ text, parts: [] }))
      : [];
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
