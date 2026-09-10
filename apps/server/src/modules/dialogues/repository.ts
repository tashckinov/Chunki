import pg from 'pg';
import { pool } from '../../db/pool.js';

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
}

export interface DialogueWithContent {
  participants: ParticipantRow[];
  messages: MessageRow[];
}

export async function findDialogueByChunkId(chunkId: string): Promise<DialogueWithContent | null> {
  const { rows: dialogueRows } = await pool.query<{ id: string }>(`SELECT id FROM chunk_dialogues WHERE chunk_id = $1`, [chunkId]);
  const dialogue = dialogueRows[0];
  if (!dialogue) return null;

  const { rows: participants } = await pool.query<ParticipantRow>(
    `SELECT character_id, side FROM chunk_dialogue_participants WHERE dialogue_id = $1`,
    [dialogue.id],
  );
  const { rows: messages } = await pool.query<MessageRow>(
    `SELECT id, character_id, character_image_id, text, position FROM chunk_dialogue_messages WHERE dialogue_id = $1 ORDER BY position`,
    [dialogue.id],
  );
  return { participants, messages };
}

export interface DialogueInput {
  participants: { characterId: string; side: 'left' | 'right' }[];
  messages: { characterId: string; characterImageId: string; text: string }[];
}

export type SaveDialogueResult = { kind: 'ok'; content: DialogueWithContent } | { kind: 'invalid_reference' };

/**
 * Full-replace save/upsert — a chunk has at most one dialogue, so a repeat
 * call replaces its participants+messages rather than creating a second
 * dialogue (mirrors admin/repository.ts's replaceSituationPrompts: delete
 * then reinsert in order, inside one transaction).
 */
export async function saveDialogue(chunkId: string, input: DialogueInput): Promise<SaveDialogueResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!(await referencesAreValid(client, input))) {
      await client.query('ROLLBACK');
      return { kind: 'invalid_reference' };
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO chunk_dialogues (chunk_id) VALUES ($1)
       ON CONFLICT (chunk_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [chunkId],
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
        `INSERT INTO chunk_dialogue_messages (dialogue_id, character_id, character_image_id, text, position) VALUES ($1, $2, $3, $4, $5)`,
        [dialogueId, m.characterId, m.characterImageId, m.text, i],
      );
    }

    await client.query('COMMIT');
    const content = await findDialogueByChunkId(chunkId);
    return { kind: 'ok', content: content! };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Every message's characterId must be a declared participant, and every characterImageId must actually belong to that character. */
async function referencesAreValid(client: pg.PoolClient, input: DialogueInput): Promise<boolean> {
  const participantIds = new Set(input.participants.map((p) => p.characterId));
  for (const m of input.messages) {
    if (!participantIds.has(m.characterId)) return false;
  }
  if (input.messages.length === 0) return true;

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
export async function deleteDialogueForChunk(chunkId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM chunk_dialogues WHERE chunk_id = $1`, [chunkId]);
  return (result.rowCount ?? 0) > 0;
}

export interface LearnerDialogueMessageRow {
  character_name: string;
  image_url: string;
  side: 'left' | 'right';
  text: string;
}

/** Resolved read for playback — one row per message, already joined to the character's name and the chosen image's URL. Empty means "no dialogue" one layer up. */
export async function findLearnerDialogueRows(chunkId: string): Promise<LearnerDialogueMessageRow[]> {
  const { rows } = await pool.query<LearnerDialogueMessageRow>(
    `SELECT ch.name AS character_name, ci.image_url, p.side, m.text
     FROM chunk_dialogues d
     JOIN chunk_dialogue_messages m ON m.dialogue_id = d.id
     JOIN characters ch ON ch.id = m.character_id
     JOIN character_images ci ON ci.id = m.character_image_id
     JOIN chunk_dialogue_participants p ON p.dialogue_id = d.id AND p.character_id = m.character_id
     WHERE d.chunk_id = $1
     ORDER BY m.position`,
    [chunkId],
  );
  return rows;
}
