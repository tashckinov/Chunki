import { z } from 'zod';
import { CEFR_LEVELS } from './types.js';

export const curriculumModuleIdSchema = z.string().min(1).max(72).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const CURRICULUM_MODULE_TYPES = ['core', 'supplementary'] as const;

export const curriculumModuleSchema = z.object({
  id: curriculumModuleIdSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  level: z.enum(CEFR_LEVELS),
  position: z.number().int().min(0).max(2147483647),
  type: z.enum(CURRICULUM_MODULE_TYPES),
  topicIds: z.array(curriculumModuleIdSchema).min(1).max(250),
}).strict();

export const curriculumModuleImportSchema = z.object({
  modules: z.array(curriculumModuleSchema).min(1).max(250),
}).strict();

export type CurriculumModule = z.infer<typeof curriculumModuleSchema>;
export type CurriculumModulePreview = {
  issues: string[];
  changes: { id: string; title: string; action: 'create' | 'update'; topics: number }[];
};
