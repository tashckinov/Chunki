import { z } from 'zod';

export const grammarTestIdSchema = z.union([z.literal('builtin'), z.string().uuid()]);
