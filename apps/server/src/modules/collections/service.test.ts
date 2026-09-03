import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionRow } from './repository.js';
import type { ChunkRow } from '../chunks/repository.js';

vi.mock('./repository.js', () => ({
  listPublishedCollections: vi.fn(),
  findPublishedCollectionBySlug: vi.fn(),
}));
vi.mock('../chunks/repository.js', () => ({
  listChunksForCollection: vi.fn(),
}));

const collectionsRepo = await import('./repository.js');
const chunksRepo = await import('../chunks/repository.js');
const { getPublishedCollections, getPublishedCollectionBySlug } = await import('./service.js');

function fakeCollection(overrides: Partial<CollectionRow> = {}): CollectionRow {
  return {
    id: 'col-1',
    slug: 'travel-basics',
    title: 'Travel Basics',
    description: 'Useful chunks for travelling.',
    level: 'A2',
    position: 10,
    ...overrides,
  };
}

function fakeChunk(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    id: 'chunk-1',
    text: 'check in',
    translation: 'зарегистрироваться',
    explanation: 'Explanation.',
    example: 'We need to check in.',
    example_translation: 'Нам нужно зарегистрироваться.',
    level: 'A2',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(collectionsRepo.listPublishedCollections).mockReset();
  vi.mocked(collectionsRepo.findPublishedCollectionBySlug).mockReset();
  vi.mocked(chunksRepo.listChunksForCollection).mockReset();
});

describe('getPublishedCollections', () => {
  it('maps rows to the public summary shape (no internal fields)', async () => {
    vi.mocked(collectionsRepo.listPublishedCollections).mockResolvedValue([fakeCollection()]);

    const result = await getPublishedCollections();

    expect(result).toEqual([
      { id: 'col-1', slug: 'travel-basics', title: 'Travel Basics', description: 'Useful chunks for travelling.', level: 'A2' },
    ]);
  });
});

describe('getPublishedCollectionBySlug', () => {
  it('returns null when the collection is not found (or unpublished — repository filters that)', async () => {
    vi.mocked(collectionsRepo.findPublishedCollectionBySlug).mockResolvedValue(null);

    const result = await getPublishedCollectionBySlug('does-not-exist');

    expect(result).toBeNull();
    expect(chunksRepo.listChunksForCollection).not.toHaveBeenCalled();
  });

  it('attaches chunks in repository order, mapped to camelCase', async () => {
    vi.mocked(collectionsRepo.findPublishedCollectionBySlug).mockResolvedValue(fakeCollection());
    vi.mocked(chunksRepo.listChunksForCollection).mockResolvedValue([
      fakeChunk({ id: 'chunk-1', text: 'check in' }),
      fakeChunk({ id: 'chunk-2', text: 'carry-on luggage' }),
    ]);

    const result = await getPublishedCollectionBySlug('travel-basics');

    expect(chunksRepo.listChunksForCollection).toHaveBeenCalledWith('col-1');
    expect(result?.chunks.map((c) => c.text)).toEqual(['check in', 'carry-on luggage']);
    expect(result?.chunks[0]).toEqual({
      id: 'chunk-1',
      text: 'check in',
      translation: 'зарегистрироваться',
      explanation: 'Explanation.',
      example: 'We need to check in.',
      exampleTranslation: 'Нам нужно зарегистрироваться.',
      level: 'A2',
    });
  });
});
