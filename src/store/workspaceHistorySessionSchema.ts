import { z } from 'zod';

import { definedProps } from '../shared/lib/definedProps';

export const workspaceHistorySessionSchema = z.object({ currentNodeId: z.string().nullable(), isAnswerRevealed: z.boolean(),
  queueNodeIds: z.array(z.string()), totalNodeCount: z.number(), completedAt: z.string().nullable().optional(),
  continueNodeId: z.string().nullable().optional(), currentItemStartedAt: z.string().nullable().optional(),
  readingElapsedMs: z.number().optional(), readTopicCount: z.number().optional(), reviewElapsedMs: z.number().optional(),
  reviewedItemCount: z.number().optional(), nextReviewDueAt: z.string().nullable().optional(),
  sessionStartedAt: z.string().nullable().optional(), soonNodeIds: z.array(z.string()).optional() }).transform(value => definedProps(value));
