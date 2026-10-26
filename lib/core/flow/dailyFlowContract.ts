import { z } from 'zod';

import type { WorkspaceNodeSnapshot } from '../database/workspaceSnapshotHelpers.js';
import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';
import type { ReviewSchedulerSettings } from '../review/settings.js';
import type { SchedulerCard } from '../review/types.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';

export type DailyFlowSnapshot = { nodeOrder: string[]; nodesById: Record<string, WorkspaceNodeSnapshot>; trashedNodeIds: string[] };
export type DailyFlowSettings = Pick<ReviewSchedulerSettings, 'newDayStartsAtHour' | 'pushQueue'> & { scope?: string };
export const dailyFlowOpenSchema = z.object({ now: z.string().datetime(),
  mode: z.enum(['recommended', 'review-first', 'reading-only']), includeScheduledFallback: z.boolean().optional(),
  seed: dailyFlowSessionSchema.optional(), preferredNodeId: z.string().nullable().optional(),
  refresh: z.boolean().optional() }).strict();
export type DailyFlowOpenArgs = z.infer<typeof dailyFlowOpenSchema>;
const reading = z.object({ intervalDurationMs: z.number(), intervalGrowthFactor: z.number(), lastHandledAt: z.string(),
  nextAt: z.string(), priority: z.number(), readingPosition: z.number(), repetitionCount: z.number(),
  state: z.enum(['active', 'done', 'dismissed', 'locked']) });
const review = z.object({ due: z.string(), lastReviewAt: z.string().nullable(), state: z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), stability: z.number(), difficulty: z.number(),
  elapsedDays: z.number(), scheduledDays: z.number(), reps: z.number(), lapses: z.number() });
const card = z.object({ due: z.string(), last_review: z.string().nullable(), state: z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), stability: z.number(), difficulty: z.number(),
  elapsed_days: z.number(), scheduled_days: z.number(), reps: z.number(), lapses: z.number() });
export const dailyFlowCommitSchema = z.object({ opId: z.string().min(1), now: z.string().datetime(),
  token: z.object({ scope: z.string(), dayKey: z.string(), revision: z.number().int().nonnegative() }).strict(),
  sourceSession: dailyFlowSessionSchema.optional(),
  nextSession: dailyFlowSessionSchema.optional(),
  readingAction: z.enum(['read', 'later', 'dismiss']).optional(),
  readings: z.array(z.object({ nodeId: z.string().min(1), before: reading.nullable(), after: reading.nullable(),
    completedReviewDay: z.string().optional() }).strict()).optional(),
  grade: z.object({ nodeId: z.string().min(1), before: review.nullable(), grade: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), reviewedAt: z.string(),
    schedulerVersion: z.string(), cardBefore: card, cardAfter: card }).strict().optional(),
  reviewHistory: z.object({ nodeId: z.string().min(1), before: review.nullable(), after: review.nullable(),
    mode: z.enum(['undo', 'redo']), targetOpId: z.string().min(1) }).strict().optional()
}).strict().refine(value => !value.readingAction || Boolean(value.readings?.length && value.readings[0]?.nodeId === value.sourceSession?.currentNodeId),
  'Reading advancement requires the current topic mutation').refine(value => Number(Boolean(value.grade)) + Number(Boolean(value.reviewHistory)) +
  Number(Boolean(value.readings?.length)) <= 1, 'Only one learning mutation per command');
export type DailyFlowCommitArgs = z.infer<typeof dailyFlowCommitSchema>;
export type DailyFlowResult = { replayed?: boolean; nodes?: Record<string, WorkspaceNodeSnapshot>; session: DailyFlowSession; readings?: { nodeId: string; reading: NonNullable<ReviewQueueNode['reading']> | null }[]; card?: SchedulerCard | null };
