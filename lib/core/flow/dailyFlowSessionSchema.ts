import { z } from 'zod';

import { definedProps } from '../definedProps.js';

import { cycleStateSchema } from './cycleFlowTypes.js';




export const dailyFlowSessionSchema = z.object({ dayWindow: z.object({ start: z.string().datetime(), end: z.string().datetime() }).optional(), flowFormat: z.enum(['legacy-queue-v1', 'cycle-v1']).optional(), cycle: cycleStateSchema.optional(), daily: z.object({ scope: z.string(), dayKey: z.string(), revision: z.number().int().nonnegative() }).optional(), currentNodeId: z.string().nullable(), isAnswerRevealed: z.boolean(),
  queueNodeIds: z.array(z.string()), totalNodeCount: z.number(), completedAt: z.string().nullable().optional(),
  continueNodeId: z.string().nullable().optional(), currentItemStartedAt: z.string().nullable().optional(),
  readingElapsedMs: z.number().optional(), readTopicCount: z.number().optional(), reviewElapsedMs: z.number().optional(),
  reviewedItemCount: z.number().optional(), nextReviewDueAt: z.string().nullable().optional(),
  sessionStartedAt: z.string().nullable().optional(), soonNodeIds: z.array(z.string()).optional(),
  hiddenSoonNodeIds: z.array(z.string()).optional() }).transform(value => definedProps(value));
