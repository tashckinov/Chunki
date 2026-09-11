import pg from 'pg';
import { pool } from '../../db/pool.js';

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: Date;
  last_login_at: Date;
  is_admin: boolean;
  premium_until: Date | null;
  production_checks_used: number;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  // No pagination yet — fine at this project's current scale; the row cap is
  // just a safety net, not a real pagination story.
  const { rows } = await pool.query<AdminUserRow>(
    `SELECT id, email, display_name, created_at, last_login_at, is_admin, premium_until, production_checks_used
     FROM users
     ORDER BY created_at DESC
     LIMIT 200`,
  );
  return rows;
}

export async function setUserPremiumUntil(id: string, premiumUntil: Date | null): Promise<AdminUserRow | null> {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE users SET premium_until = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, email, display_name, created_at, last_login_at, is_admin, premium_until, production_checks_used`,
    [id, premiumUntil],
  );
  return rows[0] ?? null;
}

export async function resetProductionChecksUsed(id: string): Promise<AdminUserRow | null> {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE users SET production_checks_used = 0, updated_at = now()
     WHERE id = $1
     RETURNING id, email, display_name, created_at, last_login_at, is_admin, premium_until, production_checks_used`,
    [id],
  );
  return rows[0] ?? null;
}

export interface AdminCollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  is_published: boolean;
  banner_url: string | null;
  chunk_count: number;
}

export async function listCollectionsAdmin(): Promise<AdminCollectionRow[]> {
  // Unlike the public collections module, this deliberately includes
  // unpublished collections — that's the whole point of an admin view.
  const { rows } = await pool.query<AdminCollectionRow>(
    `SELECT c.id, c.slug, c.title, c.description, c.level, c.position, c.is_published, c.banner_url,
            COUNT(cc.chunk_id)::int AS chunk_count
     FROM collections c
     LEFT JOIN collection_chunks cc ON cc.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.position, c.title`,
  );
  return rows;
}

type CollectionRowNoCount = Omit<AdminCollectionRow, 'chunk_count'>;

async function findCollectionById(id: string): Promise<CollectionRowNoCount | null> {
  const { rows } = await pool.query<CollectionRowNoCount>(
    `SELECT id, slug, title, description, level, position, is_published, banner_url FROM collections WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface NewCollectionInput {
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  isPublished: boolean;
  bannerUrl: string | null;
}

export async function createCollection(input: NewCollectionInput): Promise<AdminCollectionRow> {
  const { rows } = await pool.query<CollectionRowNoCount>(
    `INSERT INTO collections (slug, title, description, level, position, is_published, banner_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, slug, title, description, level, position, is_published, banner_url`,
    [input.slug, input.title, input.description, input.level, input.position, input.isPublished, input.bannerUrl],
  );
  return { ...rows[0], chunk_count: 0 };
}

export interface CollectionPatch {
  slug?: string;
  title?: string;
  description?: string | null;
  level?: string;
  position?: number;
  isPublished?: boolean;
  bannerUrl?: string | null;
}

export async function updateCollection(id: string, patch: CollectionPatch): Promise<CollectionRowNoCount | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.slug !== undefined) add('slug', patch.slug);
  if (patch.title !== undefined) add('title', patch.title);
  if (patch.description !== undefined) add('description', patch.description);
  if (patch.level !== undefined) add('level', patch.level);
  if (patch.position !== undefined) add('position', patch.position);
  if (patch.isPublished !== undefined) add('is_published', patch.isPublished);
  if (patch.bannerUrl !== undefined) add('banner_url', patch.bannerUrl);
  if (sets.length === 0) return findCollectionById(id);

  sets.push('updated_at = now()');
  const { rows } = await pool.query<CollectionRowNoCount>(
    `UPDATE collections SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, slug, title, description, level, position, is_published, banner_url`,
    values,
  );
  return rows[0] ?? null;
}

export interface AdminChunkSentencePart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

export interface AdminChunkSentenceRow {
  text: string;
  translation: string;
  parts: AdminChunkSentencePart[];
}

export interface AdminSituationPromptPart {
  text: string;
  explanationRu: string;
  explanationEn: string;
}

export interface AdminSituationPrompt {
  text: string;
  parts: AdminSituationPromptPart[];
}

export interface AdminChunkRow {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  situation_prompts: AdminSituationPrompt[];
  sentences: AdminChunkSentenceRow[];
  has_dialogue: boolean;
  has_situation_dialogue: boolean;
  position: number;
}

// A dialogue row with zero messages counts as "no dialogue" here too — matches
// how dialogues/repository.ts's findLearnerDialogueRows treats an empty
// message set as "no dialogue" for the learner side. Scoped to kind='browse',
// the "Не знаю" comic.
const HAS_DIALOGUE_SUBQUERY = `EXISTS (
              SELECT 1 FROM chunk_dialogues d
              JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id
              WHERE d.chunk_id = c.id AND d.kind = 'browse'
            ) AS has_dialogue`;

// The "Ситуация" comic (kind='situation') only counts as ready once its last
// message is actually marked is_blank — an authored-but-unfinished comic
// (no blank picked yet) shouldn't make the admin list say it's usable.
const HAS_SITUATION_DIALOGUE_SUBQUERY = `EXISTS (
              SELECT 1 FROM chunk_dialogues d
              JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id AND m.is_blank
              WHERE d.chunk_id = c.id AND d.kind = 'situation'
            ) AS has_situation_dialogue`;

interface RawSentenceRow {
  chunk_id: string;
  sentence_id: string;
  text: string;
  translation: string;
}

interface RawPartRow {
  sentence_id: string;
  text: string;
  explanation_ru: string;
  explanation_en: string;
}

/** Batch-fetches every sentence (+ its parts) for a set of chunk ids in two
 * flat queries and groups them in application code — same "LEFT JOIN, group
 * in JS" style already used by characters/repository.ts for images-per-
 * character, simpler to read than a nested json_agg subquery. */
async function fetchSentencesForChunks(chunkIds: string[], client: pg.PoolClient | pg.Pool = pool): Promise<Map<string, AdminChunkSentenceRow[]>> {
  if (chunkIds.length === 0) return new Map();
  const { rows: sentenceRows } = await client.query<RawSentenceRow>(
    `SELECT chunk_id, id AS sentence_id, text, translation
     FROM chunk_sentences WHERE chunk_id = ANY($1::uuid[]) ORDER BY chunk_id, position`,
    [chunkIds],
  );
  const sentenceIds = sentenceRows.map((r) => r.sentence_id);
  const partsBySentence = new Map<string, AdminChunkSentencePart[]>();
  if (sentenceIds.length > 0) {
    const { rows: partRows } = await client.query<RawPartRow>(
      `SELECT sentence_id, text, explanation_ru, explanation_en
       FROM chunk_sentence_parts WHERE sentence_id = ANY($1::uuid[]) ORDER BY sentence_id, position`,
      [sentenceIds],
    );
    for (const p of partRows) {
      const arr = partsBySentence.get(p.sentence_id) ?? [];
      arr.push({ text: p.text, explanationRu: p.explanation_ru, explanationEn: p.explanation_en });
      partsBySentence.set(p.sentence_id, arr);
    }
  }
  const byChunk = new Map<string, AdminChunkSentenceRow[]>();
  for (const s of sentenceRows) {
    const arr = byChunk.get(s.chunk_id) ?? [];
    arr.push({ text: s.text, translation: s.translation, parts: partsBySentence.get(s.sentence_id) ?? [] });
    byChunk.set(s.chunk_id, arr);
  }
  return byChunk;
}

interface RawSituationPromptRow {
  chunk_id: string;
  prompt_id: string;
  prompt: string;
}

interface RawSituationPromptPartRow {
  situation_prompt_id: string;
  text: string;
  explanation_ru: string;
  explanation_en: string;
}

/** Same batch-fetch-then-group approach as fetchSentencesForChunks above, for situation prompts + their parts. */
async function fetchSituationPromptsForChunks(chunkIds: string[], client: pg.PoolClient | pg.Pool = pool): Promise<Map<string, AdminSituationPrompt[]>> {
  if (chunkIds.length === 0) return new Map();
  const { rows: promptRows } = await client.query<RawSituationPromptRow>(
    `SELECT chunk_id, id AS prompt_id, prompt
     FROM chunk_situation_prompts WHERE chunk_id = ANY($1::uuid[]) ORDER BY chunk_id, position`,
    [chunkIds],
  );
  const promptIds = promptRows.map((r) => r.prompt_id);
  const partsByPrompt = new Map<string, AdminSituationPromptPart[]>();
  if (promptIds.length > 0) {
    const { rows: partRows } = await client.query<RawSituationPromptPartRow>(
      `SELECT situation_prompt_id, text, explanation_ru, explanation_en
       FROM chunk_situation_prompt_parts WHERE situation_prompt_id = ANY($1::uuid[]) ORDER BY situation_prompt_id, position`,
      [promptIds],
    );
    for (const p of partRows) {
      const arr = partsByPrompt.get(p.situation_prompt_id) ?? [];
      arr.push({ text: p.text, explanationRu: p.explanation_ru, explanationEn: p.explanation_en });
      partsByPrompt.set(p.situation_prompt_id, arr);
    }
  }
  const byChunk = new Map<string, AdminSituationPrompt[]>();
  for (const p of promptRows) {
    const arr = byChunk.get(p.chunk_id) ?? [];
    arr.push({ text: p.prompt, parts: partsByPrompt.get(p.prompt_id) ?? [] });
    byChunk.set(p.chunk_id, arr);
  }
  return byChunk;
}

/** Full-replace, delete-then-reinsert-in-order — same pattern as replaceSituationPrompts below, just nested one level deeper (each sentence's parts). */
async function replaceChunkSentences(client: pg.PoolClient, chunkId: string, sentences: AdminChunkSentenceRow[]): Promise<void> {
  await client.query(`DELETE FROM chunk_sentences WHERE chunk_id = $1`, [chunkId]);
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO chunk_sentences (chunk_id, text, translation, position) VALUES ($1, $2, $3, $4) RETURNING id`,
      [chunkId, sentence.text, sentence.translation, i],
    );
    const sentenceId = rows[0].id;
    for (let j = 0; j < sentence.parts.length; j++) {
      const part = sentence.parts[j];
      await client.query(
        `INSERT INTO chunk_sentence_parts (sentence_id, text, explanation_ru, explanation_en, position) VALUES ($1, $2, $3, $4, $5)`,
        [sentenceId, part.text, part.explanationRu, part.explanationEn, j],
      );
    }
  }
}

export async function listChunksForCollectionAdmin(collectionId: string): Promise<AdminChunkRow[]> {
  const { rows } = await pool.query<Omit<AdminChunkRow, 'sentences' | 'situation_prompts'>>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.level, cc.position,
            ${HAS_DIALOGUE_SUBQUERY},
            ${HAS_SITUATION_DIALOGUE_SUBQUERY}
     FROM collection_chunks cc
     JOIN chunks c ON c.id = cc.chunk_id
     WHERE cc.collection_id = $1
     ORDER BY cc.position`,
    [collectionId],
  );
  const chunkIds = rows.map((r) => r.id);
  const sentencesByChunk = await fetchSentencesForChunks(chunkIds);
  const situationPromptsByChunk = await fetchSituationPromptsForChunks(chunkIds);
  return rows.map((r) => ({ ...r, sentences: sentencesByChunk.get(r.id) ?? [], situation_prompts: situationPromptsByChunk.get(r.id) ?? [] }));
}

type ChunkRowNoPosition = Omit<AdminChunkRow, 'position'>;

async function findChunkByIdAdmin(id: string, client: pg.PoolClient | pg.Pool = pool): Promise<ChunkRowNoPosition | null> {
  const { rows } = await client.query<Omit<ChunkRowNoPosition, 'sentences' | 'situation_prompts'>>(
    `SELECT c.id, c.text, c.translation, c.explanation, c.level,
            ${HAS_DIALOGUE_SUBQUERY},
            ${HAS_SITUATION_DIALOGUE_SUBQUERY}
     FROM chunks c WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const sentencesByChunk = await fetchSentencesForChunks([rows[0].id], client);
  const situationPromptsByChunk = await fetchSituationPromptsForChunks([rows[0].id], client);
  return { ...rows[0], sentences: sentencesByChunk.get(rows[0].id) ?? [], situation_prompts: situationPromptsByChunk.get(rows[0].id) ?? [] };
}

/** Full-replace, delete-then-reinsert-in-order — same pattern as replaceChunkSentences above, mirrored for situation prompts + their parts. */
async function replaceSituationPrompts(client: pg.PoolClient, chunkId: string, prompts: AdminSituationPrompt[]): Promise<void> {
  await client.query(`DELETE FROM chunk_situation_prompts WHERE chunk_id = $1`, [chunkId]);
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO chunk_situation_prompts (chunk_id, prompt, position) VALUES ($1, $2, $3) RETURNING id`,
      [chunkId, prompt.text, i],
    );
    const promptId = rows[0].id;
    for (let j = 0; j < prompt.parts.length; j++) {
      const part = prompt.parts[j];
      await client.query(
        `INSERT INTO chunk_situation_prompt_parts (situation_prompt_id, text, explanation_ru, explanation_en, position) VALUES ($1, $2, $3, $4, $5)`,
        [promptId, part.text, part.explanationRu, part.explanationEn, j],
      );
    }
  }
}

export interface ChunkInput {
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  situationPrompts: AdminSituationPrompt[];
  sentences: AdminChunkSentenceRow[];
}

/** Inserts the chunk and appends it to the collection in one transaction — a chunk row without a collection_chunks membership would be orphaned and unreachable from any deck. */
export async function createChunkInCollection(collectionId: string, input: ChunkInput): Promise<AdminChunkRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: chunkRows } = await client.query<Omit<ChunkRowNoPosition, 'situation_prompts' | 'sentences' | 'has_dialogue' | 'has_situation_dialogue'>>(
      `INSERT INTO chunks (text, translation, explanation, level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, text, translation, explanation, level`,
      [input.text, input.translation, input.explanation, input.level],
    );
    const chunk = chunkRows[0];
    await replaceSituationPrompts(client, chunk.id, input.situationPrompts);
    await replaceChunkSentences(client, chunk.id, input.sentences);
    const { rows: posRows } = await client.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM collection_chunks WHERE collection_id = $1`,
      [collectionId],
    );
    const position = posRows[0].next_position;
    await client.query(`INSERT INTO collection_chunks (collection_id, chunk_id, position) VALUES ($1, $2, $3)`, [collectionId, chunk.id, position]);
    await client.query('COMMIT');
    return { ...chunk, situation_prompts: input.situationPrompts, sentences: input.sentences, has_dialogue: false, has_situation_dialogue: false, position };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface ChunkPatch {
  text?: string;
  translation?: string;
  explanation?: string | null;
  level?: string;
  situationPrompts?: AdminSituationPrompt[];
  sentences?: AdminChunkSentenceRow[];
}

export async function updateChunk(id: string, patch: ChunkPatch): Promise<ChunkRowNoPosition | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const values: unknown[] = [id];
    const sets: string[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (patch.text !== undefined) add('text', patch.text);
    if (patch.translation !== undefined) add('translation', patch.translation);
    if (patch.explanation !== undefined) add('explanation', patch.explanation);
    if (patch.level !== undefined) add('level', patch.level);

    if (sets.length > 0) {
      sets.push('updated_at = now()');
      const { rows } = await client.query(`UPDATE chunks SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, values);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
    } else {
      const { rows } = await client.query(`SELECT id FROM chunks WHERE id = $1`, [id]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
    }

    if (patch.situationPrompts !== undefined) {
      await replaceSituationPrompts(client, id, patch.situationPrompts);
    }
    if (patch.sentences !== undefined) {
      await replaceChunkSentences(client, id, patch.sentences);
    }

    const row = await findChunkByIdAdmin(id, client);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** ON DELETE CASCADE on both collection_chunks and chunk_progress (see their migrations) means this alone detaches the chunk from every collection and clears any learner progress on it. */
export async function deleteChunk(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM chunks WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Detach only — for a chunk that also belongs to other collections and shouldn't be deleted outright. */
export async function removeChunkFromCollection(collectionId: string, chunkId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM collection_chunks WHERE collection_id = $1 AND chunk_id = $2`, [collectionId, chunkId]);
  return (result.rowCount ?? 0) > 0;
}
