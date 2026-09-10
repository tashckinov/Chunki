import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import { UPLOADS_DIR } from '../../config/uploads.js';
import {
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  addCharacterImage,
  updateCharacterImage,
  reorderCharacterImages,
  deleteCharacterImage,
  findChunksUsingCharacter,
} from './service.js';

// Full-body portraits are taller than wide; emotion thumbnails render small
// in a grid — both just need a comfortable retina-ish cap, same idea as the
// collection banner's BANNER_MAX_DIMENSION.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FULL_BODY_MAX_DIMENSION = 1200;
const EMOTION_IMAGE_MAX_DIMENSION = 800;

const idParamSchema = z.object({ id: z.string().uuid() });
const imageParamSchema = z.object({ id: z.string().uuid(), imageId: z.string().uuid() });

const characterCreateSchema = z.object({ name: z.string().min(1) });
const characterPatchSchema = z.object({ name: z.string().min(1).optional() });
const imagePatchSchema = z
  .object({ emotion: z.string().min(1).optional(), description: z.string().max(300).nullable().optional() })
  .refine((v) => v.emotion !== undefined || v.description !== undefined, { message: 'at least one field required' });
const reorderSchema = z.object({ emotion: z.string().min(1), imageIds: z.array(z.string().uuid()).min(1) });

// JPEG has no alpha channel — sharp flattens transparent source pixels onto
// black by default, which silently destroys transparency on PNG uploads.
// Preserve it by keeping alpha-bearing images as PNG; only genuinely opaque
// images get re-encoded to the smaller JPEG.
async function resizeImage(original: Buffer, maxDimension: number): Promise<{ buffer: Buffer; extension: 'png' | 'jpg' }> {
  const image = sharp(original).resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true });
  const { hasAlpha } = await sharp(original).metadata();
  if (hasAlpha) {
    return { buffer: await image.png({ compressionLevel: 8 }).toBuffer(), extension: 'png' };
  }
  return { buffer: await image.jpeg({ quality: 82 }).toBuffer(), extension: 'jpg' };
}

/** Every route here is admin-only — same plugin-wide preHandler pattern as admin/routes.ts. */
export const charactersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 } });

  app.get('/', async () => ({ characters: await listCharacters() }));

  app.post('/', async (request, reply) => {
    const body = characterCreateSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const character = await createCharacter(body.data.name);
    reply.code(201);
    return { character };
  });

  app.patch('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = characterPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await updateCharacter(params.data.id, body.data);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { character: result.character };
  });

  app.delete('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const deleted = await deleteCharacter(params.data.id);
    if (!deleted) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });

  // Lets the admin see, before deleting a character, which chunks' dialogues actually use it.
  app.get('/:id/chunks', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { chunks: await findChunksUsingCharacter(params.data.id) };
  });

  app.post('/:id/full-body-image', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const file = await request.file();
    if (!file || !file.mimetype.startsWith('image/')) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    let original: Buffer;
    try {
      original = await file.toBuffer();
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
        reply.code(400);
        return { error: 'file_too_large' };
      }
      throw err;
    }

    let resized: { buffer: Buffer; extension: 'png' | 'jpg' };
    try {
      resized = await resizeImage(original, FULL_BODY_MAX_DIMENSION);
    } catch {
      reply.code(400);
      return { error: 'invalid_file_type' };
    }

    const filename = `${randomUUID()}.${resized.extension}`;
    const dir = path.join(UPLOADS_DIR, 'characters');
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), resized.buffer);

    const result = await updateCharacter(params.data.id, { fullBodyImageUrl: `/uploads/characters/${filename}` });
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { character: result.character };
  });

  // Multi-file drop: one shared `emotion` field applies to every file in the
  // batch — matches the UI flow (pick/type one emotion, then drop several
  // images at once for it), and avoids fragile per-file field alignment.
  app.post('/:id/images', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const images = [];
    let emotion: string | null = null;
    for await (const file of request.files()) {
      const emotionField = file.fields.emotion;
      const fieldValue = emotionField && !Array.isArray(emotionField) && emotionField.type === 'field' ? emotionField.value : undefined;
      if (typeof fieldValue === 'string' && fieldValue.trim()) emotion = fieldValue.trim();

      if (!file.mimetype.startsWith('image/')) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      let original: Buffer;
      try {
        original = await file.toBuffer();
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
          reply.code(400);
          return { error: 'file_too_large' };
        }
        throw err;
      }
      let resized: { buffer: Buffer; extension: 'png' | 'jpg' };
      try {
        resized = await resizeImage(original, EMOTION_IMAGE_MAX_DIMENSION);
      } catch {
        reply.code(400);
        return { error: 'invalid_file_type' };
      }
      const filename = `${randomUUID()}.${resized.extension}`;
      const dir = path.join(UPLOADS_DIR, 'characters');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, filename), resized.buffer);
      images.push({ imageUrl: `/uploads/characters/${filename}` });
    }

    if (!emotion) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    if (images.length === 0) {
      reply.code(400);
      return { error: 'invalid_request' };
    }

    const created = [];
    for (const image of images) created.push(await addCharacterImage(params.data.id, { emotion, imageUrl: image.imageUrl }));
    return { images: created };
  });

  app.patch('/:id/images/:imageId', async (request, reply) => {
    const params = imageParamSchema.safeParse(request.params);
    const body = imagePatchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const image = await updateCharacterImage(params.data.imageId, body.data);
    if (!image) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { image };
  });

  app.post('/:id/images/reorder', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = reorderSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    await reorderCharacterImages(params.data.id, body.data.emotion, body.data.imageIds);
    return { ok: true };
  });

  app.delete('/:id/images/:imageId', async (request, reply) => {
    const params = imageParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const result = await deleteCharacterImage(params.data.imageId);
    if (result === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (result === 'in_use') {
      reply.code(409);
      return { error: 'image_in_use' };
    }
    return { ok: true };
  });
};
