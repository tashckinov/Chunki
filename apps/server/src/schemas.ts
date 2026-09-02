import { z } from 'zod';

export const placementTestSubmissionSchema = z.object({
  mcqAnswers: z.record(z.string(), z.string()),
  open9: z.string().max(4000),
  open10: z.string().max(4000),
  essay: z.string().max(8000),
});

export const exercisesSubmissionSchema = z.object({
  topicId: z.string().min(1),
  topicTitle: z.string().min(1),
  blockAnswers: z.array(
    z.object({
      blockKey: z.string().min(1),
      choiceAnswers: z.record(z.string(), z.string()),
      writeAnswers: z.record(z.string(), z.string()),
    }),
  ),
});
