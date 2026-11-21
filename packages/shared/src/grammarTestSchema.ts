import { z } from 'zod';

const question = z.string().trim().min(1).max(700);

const grammarTestDefinitionSchema = z.object({
  mcq: z.array(z.object({
    n: z.number().int().min(1).max(8),
    q: question,
    options: z.array(question).length(4).refine((values) => new Set(values.map((value) => value.toLowerCase())).size === 4, 'Ответы должны отличаться.'),
    correct: z.enum(['A', 'B', 'C', 'D']),
  })).length(8).refine((items) => items.every((item, index) => item.n === index + 1), 'Номера вопросов должны идти от 1 до 8.'),
  readingPassage: z.string().trim().min(1).max(4000),
  readingQuestions: z.array(z.object({ n: z.number().int(), q: question })).length(2)
    .refine((items) => items.every((item, index) => item.n === index + 9), 'Номера вопросов по тексту должны быть 9 и 10.'),
  essayPrompt: question,
});

export const grammarTestDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  definition: grammarTestDefinitionSchema,
});
