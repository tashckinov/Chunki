import { pool } from '../../db/pool.js';

export interface CharacterRow {
  id: string;
  name: string;
  full_body_image_url: string | null;
  position: number;
  created_at: Date;
}

export interface CharacterImageRow {
  id: string;
  character_id: string;
  emotion: string;
  image_url: string;
  description: string | null;
  position: number;
  created_at: Date;
}

export interface CharacterWithImages {
  character: CharacterRow;
  images: CharacterImageRow[];
}

function groupByCharacter(characterRows: CharacterRow[], imageRows: CharacterImageRow[]): CharacterWithImages[] {
  const imagesByCharacter = new Map<string, CharacterImageRow[]>();
  for (const image of imageRows) {
    const list = imagesByCharacter.get(image.character_id) ?? [];
    list.push(image);
    imagesByCharacter.set(image.character_id, list);
  }
  return characterRows.map((character) => ({ character, images: imagesByCharacter.get(character.id) ?? [] }));
}

export async function listCharacters(): Promise<CharacterWithImages[]> {
  const { rows: characterRows } = await pool.query<CharacterRow>(
    `SELECT id, name, full_body_image_url, position, created_at FROM characters ORDER BY position, name`,
  );
  const { rows: imageRows } = await pool.query<CharacterImageRow>(
    `SELECT id, character_id, emotion, image_url, description, position, created_at FROM character_images ORDER BY character_id, emotion, position`,
  );
  return groupByCharacter(characterRows, imageRows);
}

export async function findCharacterById(id: string): Promise<CharacterWithImages | null> {
  const { rows: characterRows } = await pool.query<CharacterRow>(
    `SELECT id, name, full_body_image_url, position, created_at FROM characters WHERE id = $1`,
    [id],
  );
  if (!characterRows[0]) return null;
  const { rows: imageRows } = await pool.query<CharacterImageRow>(
    `SELECT id, character_id, emotion, image_url, description, position, created_at FROM character_images WHERE character_id = $1 ORDER BY emotion, position`,
    [id],
  );
  return { character: characterRows[0], images: imageRows };
}

export async function createCharacter(name: string): Promise<CharacterRow> {
  const { rows: posRows } = await pool.query<{ next_position: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM characters`,
  );
  const { rows } = await pool.query<CharacterRow>(
    `INSERT INTO characters (name, position) VALUES ($1, $2)
     RETURNING id, name, full_body_image_url, position, created_at`,
    [name, posRows[0].next_position],
  );
  return rows[0];
}

export interface CharacterPatch {
  name?: string;
  fullBodyImageUrl?: string | null;
}

export async function updateCharacter(id: string, patch: CharacterPatch): Promise<CharacterRow | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.name !== undefined) add('name', patch.name);
  if (patch.fullBodyImageUrl !== undefined) add('full_body_image_url', patch.fullBodyImageUrl);
  if (sets.length === 0) {
    const { rows } = await pool.query<CharacterRow>(
      `SELECT id, name, full_body_image_url, position, created_at FROM characters WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  const { rows } = await pool.query<CharacterRow>(
    `UPDATE characters SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, full_body_image_url, position, created_at`,
    values,
  );
  return rows[0] ?? null;
}

/** Cascades to character_images via ON DELETE CASCADE. */
export async function deleteCharacter(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM characters WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Appends a new image at the end of its (character, emotion) group. */
export async function addCharacterImage(characterId: string, input: { emotion: string; imageUrl: string; description?: string | null }): Promise<CharacterImageRow> {
  const { rows: posRows } = await pool.query<{ next_position: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM character_images WHERE character_id = $1 AND emotion = $2`,
    [characterId, input.emotion],
  );
  const { rows } = await pool.query<CharacterImageRow>(
    `INSERT INTO character_images (character_id, emotion, image_url, description, position) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, character_id, emotion, image_url, description, position, created_at`,
    [characterId, input.emotion, input.imageUrl, input.description ?? null, posRows[0].next_position],
  );
  return rows[0];
}

export interface CharacterImagePatch {
  emotion?: string;
  description?: string | null;
}

/**
 * Generalized image patch: relabeling to a different emotion appends the
 * image at the end of the target group — this is what "drag a thumbnail
 * into a different emotion's section" does under the hood, no separate
 * move-vs-relabel distinction needed since emotion is just a label column.
 * A description-only patch never touches emotion/position.
 */
export async function updateCharacterImage(id: string, patch: CharacterImagePatch): Promise<CharacterImageRow | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];
  if (patch.description !== undefined) {
    values.push(patch.description);
    sets.push(`description = $${values.length}`);
  }
  if (patch.emotion !== undefined) {
    values.push(patch.emotion);
    const emotionParam = values.length;
    sets.push(`emotion = $${emotionParam}`);
    sets.push(
      `position = (SELECT COALESCE(MAX(position), -1) + 1 FROM character_images WHERE character_id = (SELECT character_id FROM character_images WHERE id = $1) AND emotion = $${emotionParam})`,
    );
  }
  if (sets.length === 0) {
    const { rows } = await pool.query<CharacterImageRow>(
      `SELECT id, character_id, emotion, image_url, description, position, created_at FROM character_images WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<CharacterImageRow>(
    `UPDATE character_images SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, character_id, emotion, image_url, description, position, created_at`,
    values,
  );
  return rows[0] ?? null;
}

/** Persists a drag-reorder within one (character, emotion) group — sets position to each id's index in the given order. */
export async function reorderCharacterImages(characterId: string, emotion: string, imageIds: string[]): Promise<void> {
  for (let i = 0; i < imageIds.length; i++) {
    await pool.query(
      `UPDATE character_images SET position = $3 WHERE id = $1 AND character_id = $2`,
      [imageIds[i], characterId, i],
    );
  }
}

export type DeleteImageResult = 'ok' | 'not_found' | 'in_use';

/**
 * ON DELETE RESTRICT on chunk_dialogue_messages.character_image_id means
 * Postgres itself refuses this delete (23503 foreign_key_violation) if the
 * image is used by an existing dialogue message — caught here and turned
 * into a typed result instead of an opaque throw, same "known-error-code"
 * style already used for FST_REQ_FILE_TOO_LARGE in the upload routes.
 */
export async function deleteCharacterImage(id: string): Promise<DeleteImageResult> {
  try {
    const result = await pool.query(`DELETE FROM character_images WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0 ? 'ok' : 'not_found';
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '23503') return 'in_use';
    throw err;
  }
}
