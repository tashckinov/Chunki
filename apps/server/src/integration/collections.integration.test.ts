// Integration tests against a REAL Postgres — run with `npm run test:integration`
// after `docker compose up -d postgres` and running migrations (see README).
// Not part of the default `npm test` run.
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { getPublishedCollectionBySlug, getPublishedCollections } from '../modules/collections/service.js';

function unique() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function insertCollection(opts: { slug: string; position: number; isPublished: boolean }) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO collections (slug, title, description, level, position, is_published)
     VALUES ($1, $2, $3, 'A2', $4, $5)
     RETURNING id`,
    [opts.slug, `Title ${opts.slug}`, 'Integration test collection', opts.position, opts.isPublished],
  );
  return rows[0].id;
}

async function insertChunk(text: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chunks (text, translation, level) VALUES ($1, $2, 'A2') RETURNING id`,
    [text, `translation of ${text}`],
  );
  return rows[0].id;
}

async function linkChunk(collectionId: string, chunkId: string, position: number) {
  await pool.query(`INSERT INTO collection_chunks (collection_id, chunk_id, position) VALUES ($1, $2, $3)`, [
    collectionId,
    chunkId,
    position,
  ]);
}

afterAll(async () => {
  await pool.end();
});

describe('collections + chunks (real database)', () => {
  it('only returns published collections, ordered by position', async () => {
    const suffix = unique();
    const published1 = await insertCollection({ slug: `it-published-b-${suffix}`, position: 200, isPublished: true });
    const published2 = await insertCollection({ slug: `it-published-a-${suffix}`, position: 100, isPublished: true });
    await insertCollection({ slug: `it-unpublished-${suffix}`, position: 50, isPublished: false });

    const all = await getPublishedCollections();
    const ours = all.filter((c) => c.slug.startsWith('it-') && c.slug.endsWith(suffix));

    expect(ours.map((c) => c.slug)).toEqual([`it-published-a-${suffix}`, `it-published-b-${suffix}`]);
    expect(ours.every((c) => c.id !== undefined)).toBe(true);
    void published1;
    void published2;
  });

  it('returns an unpublished collection as not found via getPublishedCollectionBySlug', async () => {
    const suffix = unique();
    await insertCollection({ slug: `it-hidden-${suffix}`, position: 1, isPublished: false });

    const result = await getPublishedCollectionBySlug(`it-hidden-${suffix}`);
    expect(result).toBeNull();
  });

  it('returns null for a slug that does not exist at all', async () => {
    const result = await getPublishedCollectionBySlug(`it-nonexistent-${unique()}`);
    expect(result).toBeNull();
  });

  it('returns chunks ordered by collection-specific position, not chunk creation order', async () => {
    const suffix = unique();
    const collectionId = await insertCollection({ slug: `it-ordering-${suffix}`, position: 1, isPublished: true });

    const chunkA = await insertChunk(`it-chunk-a-${suffix}`);
    const chunkB = await insertChunk(`it-chunk-b-${suffix}`);
    const chunkC = await insertChunk(`it-chunk-c-${suffix}`);

    // Link in a deliberately different order than creation, to prove
    // position (not chunk id/creation time) determines the result order.
    await linkChunk(collectionId, chunkC, 0);
    await linkChunk(collectionId, chunkA, 1);
    await linkChunk(collectionId, chunkB, 2);

    const result = await getPublishedCollectionBySlug(`it-ordering-${suffix}`);
    expect(result?.chunks.map((c) => c.text)).toEqual([`it-chunk-c-${suffix}`, `it-chunk-a-${suffix}`, `it-chunk-b-${suffix}`]);
  });

  it('prevents a duplicate (collection, chunk) association', async () => {
    const suffix = unique();
    const collectionId = await insertCollection({ slug: `it-dup-${suffix}`, position: 1, isPublished: true });
    const chunkId = await insertChunk(`it-dup-chunk-${suffix}`);

    await linkChunk(collectionId, chunkId, 0);

    await expect(linkChunk(collectionId, chunkId, 1)).rejects.toThrow(/duplicate key value/i);
  });

  it('deleting a chunk removes it from a collection without deleting the collection', async () => {
    const suffix = unique();
    const collectionId = await insertCollection({ slug: `it-cascade-${suffix}`, position: 1, isPublished: true });
    const chunkId = await insertChunk(`it-cascade-chunk-${suffix}`);
    await linkChunk(collectionId, chunkId, 0);

    await pool.query('DELETE FROM chunks WHERE id = $1', [chunkId]);

    const result = await getPublishedCollectionBySlug(`it-cascade-${suffix}`);
    expect(result).not.toBeNull();
    expect(result?.chunks).toEqual([]);
  });
});
