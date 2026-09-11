import pg from 'pg';
import { pool } from '../../db/pool.js';

/**
 * A chunk has at most one dialogue per kind: 'browse' is the passive comic
 * shown on "Не знаю"; 'situation' is the comic shown in "Ситуация" whose
 * last message the learner fills in themselves (see is_blank below).
 */
export type DialogueKind = 'browse' | 'situation';

export interface ParticipantRow {
  character_id: string;
  side: 'left' | 'right';
}

export interface MessageRow {
  id: string;
  character_id: string;
  character_image_id: string;
  text: string;
  position: number;
  is_blank: boolean;
}

export interface DialogueWithContent {
  participants: ParticipantRow[];
  messages: MessageRow[];
}

export async function findDialogueByChunkId(chunkId: string, kind: DialogueKind): Promise<DialogueWithContent | null> {
  const { rows: dialogueRows } = await pool.query<{ id: string }>(`SELECT id FROM chunk_dialogues WHERE chunk_id = $1 AND kind = $2`, [chunkId, kind]);
  const dialogue = dialogueRows[0];
  if (!dialogue) return null;

  const { rows: participants } = await pool.query<ParticipantRow>(
    `SELECT character_id, side FROM chunk_dialogue_participants WHERE dialogue_id = $1`,
    [dialogue.id],
  );
  const { rows: messages } = await pool.query<MessageRow>(
    `SELECT id, character_id, character_image_id, text, position, is_blank FROM chunk_dialogue_messages WHERE dialogue_id = $1 ORDER BY position`,
    [dialogue.id],
  );
  return { participants, messages };
}

export interface DialogueInput {
  participants: { characterId: string; side: 'left' | 'right' }[];
  messages: { characterId: string; characterImageId: string; text: string; isBlank?: boolean }[];
}

export type SaveDialogueResult = { kind: 'ok'; content: DialogueWithContent } | { kind: 'invalid_reference' };

/**
 * Full-replace save/upsert — a chunk has at most one dialogue per kind, so a
 * repeat call for the same kind replaces its participants+messages rather
 * than creating a second dialogue (mirrors admin/repository.ts's
 * replaceSituationPrompts: delete then reinsert in order, inside one
 * transaction).
 */
export async function saveDialogue(chunkId: string, kind: DialogueKind, input: DialogueInput): Promise<SaveDialogueResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!(await referencesAreValid(client, input))) {
      await client.query('ROLLBACK');
      return { kind: 'invalid_reference' };
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO chunk_dialogues (chunk_id, kind) VALUES ($1, $2)
       ON CONFLICT (chunk_id, kind) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [chunkId, kind],
    );
    const dialogueId = rows[0].id;

    await client.query(`DELETE FROM chunk_dialogue_participants WHERE dialogue_id = $1`, [dialogueId]);
    for (const p of input.participants) {
      await client.query(`INSERT INTO chunk_dialogue_participants (dialogue_id, character_id, side) VALUES ($1, $2, $3)`, [dialogueId, p.characterId, p.side]);
    }

    await client.query(`DELETE FROM chunk_dialogue_messages WHERE dialogue_id = $1`, [dialogueId]);
    for (let i = 0; i < input.messages.length; i++) {
      const m = input.messages[i];
      await client.query(
        `INSERT INTO chunk_dialogue_messages (dialogue_id, character_id, character_image_id, text, position, is_blank) VALUES ($1, $2, $3, $4, $5, $6)`,
        [dialogueId, m.characterId, m.characterImageId, m.text, i, !!m.isBlank],
      );
    }

    await client.query('COMMIT');
    const content = await findDialogueByChunkId(chunkId, kind);
    return { kind: 'ok', content: content! };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Every message's characterId must be a declared participant, every
 * characterImageId must actually belong to that character, at most one
 * message may be the learner-filled blank, and — since the "Ситуация" flow
 * only ever shows messages up to the blank and never anything after it —
 * that blank must be the last message.
 */
async function referencesAreValid(client: pg.PoolClient, input: DialogueInput): Promise<boolean> {
  const participantIds = new Set(input.participants.map((p) => p.characterId));
  for (const m of input.messages) {
    if (!participantIds.has(m.characterId)) return false;
  }
  if (input.messages.length === 0) return true;

  const blankCount = input.messages.filter((m) => m.isBlank).length;
  if (blankCount > 1) return false;
  if (blankCount === 1 && !input.messages[input.messages.length - 1].isBlank) return false;

  const imageIds = [...new Set(input.messages.map((m) => m.characterImageId))];
  const { rows } = await client.query<{ id: string; character_id: string }>(
    `SELECT id, character_id FROM character_images WHERE id = ANY($1)`,
    [imageIds],
  );
  const characterIdByImageId = new Map(rows.map((r) => [r.id, r.character_id]));
  for (const m of input.messages) {
    if (characterIdByImageId.get(m.characterImageId) !== m.characterId) return false;
  }
  return true;
}

/** ON DELETE CASCADE on both child tables means this alone removes the participants and messages too. */
export async function deleteDialogueForChunk(chunkId: string, kind: DialogueKind): Promise<boolean> {
  const result = await pool.query(`DELETE FROM chunk_dialogues WHERE chunk_id = $1 AND kind = $2`, [chunkId, kind]);
  return (result.rowCount ?? 0) > 0;
}

export interface ChunkUsingCharacterRow {
  chunk_id: string;
  chunk_text: string;
  chunk_translation: string;
  dialogue_kind: DialogueKind;
  collection_titles: string[];
}

/**
 * Every (chunk, dialogue kind) whose dialogue actually has a message spoken
 * by this character — deliberately queries chunk_dialogue_messages, not
 * chunk_dialogue_participants: the FK that blocks deleting a character's
 * image (character_image_id on this same table) is keyed off messages, and
 * participants/messages are only kept in sync by application-level
 * validation (saveDialogue's referencesAreValid), not a DB constraint — a
 * participant row is not a reliable proxy for "is this character's own
 * image actually referenced." Grouped by kind too (not just chunk) since a
 * chunk can now have both a 'browse' and a 'situation' comic, independently
 * using this character — collapsing them would point "jump to editor" at
 * the wrong one.
 */
export async function findChunksUsingCharacter(characterId: string): Promise<ChunkUsingCharacterRow[]> {
  const { rows } = await pool.query<ChunkUsingCharacterRow>(
    `SELECT c.id AS chunk_id, c.text AS chunk_text, c.translation AS chunk_translation, d.kind AS dialogue_kind,
            COALESCE(array_agg(DISTINCT col.title) FILTER (WHERE col.id IS NOT NULL), ARRAY[]::text[]) AS collection_titles
     FROM chunk_dialogue_messages m
     JOIN chunk_dialogues d ON d.id = m.dialogue_id
     JOIN chunks c ON c.id = d.chunk_id
     LEFT JOIN collection_chunks cc ON cc.chunk_id = c.id
     LEFT JOIN collections col ON col.id = cc.collection_id
     WHERE m.character_id = $1
     GROUP BY c.id, c.text, c.translation, d.kind
     ORDER BY c.text`,
    [characterId],
  );
  return rows;
}

export interface LearnerDialogueMessageRow {
  character_name: string;
  image_url: string;
  side: 'left' | 'right';
  text: string;
  is_blank: boolean;
}

/** Resolved read for playback — one row per message, already joined to the character's name and the chosen image's URL. Empty means "no dialogue" one layer up. */
export async function findLearnerDialogueRows(chunkId: string, kind: DialogueKind): Promise<LearnerDialogueMessageRow[]> {
  const { rows } = await pool.query<LearnerDialogueMessageRow>(
    `SELECT ch.name AS character_name, ci.image_url, p.side, m.text, m.is_blank
     FROM chunk_dialogues d
     JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id
     JOIN characters ch ON ch.id = m.character_id
     JOIN character_images ci ON ci.id = m.character_image_id
     JOIN chunk_dialogue_participants p ON p.dialogue_id = d.id AND p.character_id = m.character_id
     WHERE d.chunk_id = $1 AND d.kind = $2
     ORDER BY m.position`,
    [chunkId, kind],
  );
  return rows;
}
