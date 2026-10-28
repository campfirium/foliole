import { z } from 'zod';

import type { WorkspaceNodeSnapshot } from '../database/workspaceSnapshotHelpers.js';
import type { ReviewQueueNode } from '../review/queue/reviewQueuePlanner.js';
import type { ReviewSchedulerSettings } from '../review/settings.js';
import type { SchedulerCard } from '../review/types.js';

import { cycleChangeSchema } from './cycleFlowTypes.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';
import { flowHistorySessionSchema } from './flowHistorySession.js';

export type DailyFlowSnapshot = { nodeOrder: string[]; nodesById: Record<string, WorkspaceNodeSnapshot>; trashedNodeIds: string[] };
export type DailyFlowLearningNode = Omit<ReviewQueueNode, 'content' | 'reveal'> & { hasContent: boolean; hasReveal: boolean };
export type DailyFlowLearningSnapshot = { nodeOrder: string[]; nodesById: Record<string, ReviewQueueNode>; trashedNodeIds: string[] };
export type DailyFlowSettings = Pick<ReviewSchedulerSettings, 'newDayStartsAtHour' | 'pushQueue'> & { scope?: string };
export const dailyFlowOpenSchema = z.object({ now: z.string().datetime(),
  mode: z.enum(['recommended', 'review-first', 'reading-only']),
  seed: dailyFlowSessionSchema.optional(), preferredNodeId: z.string().nullable().optional(),
  prepareOnly: z.boolean().optional(), startup: z.boolean().optional(), refresh: z.boolean().optional() }).strict();
export type DailyFlowOpenArgs = z.infer<typeof dailyFlowOpenSchema>;
export const dailyFlowReadingSchema = z.object({ intervalDurationMs: z.number(), intervalGrowthFactor: z.number(), lastHandledAt: z.string(),
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
  navigation: z.literal('continue-reading').optional(),
  expectedContinueNodeId: z.string().min(1).optional(),
  sourceSession: flowHistorySessionSchema.optional(),
  historySourceSession: flowHistorySessionSchema.optional(),
  nextSession: flowHistorySessionSchema.optional(),
  readingAction: z.enum(['read', 'later', 'dismiss', 'soon']).optional(),
  historyMode: z.enum(['undo', 'redo']).optional(),
  cycleReplay: cycleChangeSchema.optional(),
  readings: z.array(z.object({ nodeId: z.string().min(1), before: dailyFlowReadingSchema.nullable(), after: dailyFlowReadingSchema.nullable(),
    completedReviewDay: z.string().optional() }).strict()).optional(),
  grade: z.object({ nodeId: z.string().min(1), before: review.nullable(), grade: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), reviewedAt: z.string(),
    schedulerVersion: z.string(), cardBefore: card, cardAfter: card }).strict().optional(),
  reviewHistory: z.object({ nodeId: z.string().min(1), before: review.nullable(), after: review.nullable(),
    mode: z.enum(['undo', 'redo']), targetOpId: z.string().min(1) }).strict().optional()
}).strict().refine(value => value.navigation ? Boolean(value.expectedContinueNodeId &&
  !value.sourceSession && !value.historySourceSession && !value.cycleReplay && !value.nextSession && !value.grade && !value.readings && !value.readingAction &&
  !value.historyMode && !value.reviewHistory) : !value.expectedContinueNodeId,
  'Continue navigation requires only its target and cursor identity').refine(value => !value.readingAction || Boolean(value.readings?.length && value.readings[0]?.nodeId === value.sourceSession?.currentNodeId),
  'Reading advancement requires the current topic mutation').refine(value => value.readingAction !== 'soon' || Boolean(
    !value.nextSession && value.readings?.length === 1 && value.readings[0]?.completedReviewDay === undefined &&
    JSON.stringify(value.readings[0]?.before) === JSON.stringify(value.readings[0]?.after)),
  'Soon advances only the current topic without changing its reading facts').refine(value => !value.historyMode || Boolean(value.sourceSession && value.nextSession &&
    !value.grade && !value.readingAction && (value.reviewHistory?.mode === value.historyMode || value.readings?.length)),
  'History replay requires its source, target and learning mutation').refine(value => Number(Boolean(value.grade)) + Number(Boolean(value.reviewHistory)) +
  Number(Boolean(value.readings?.length)) <= 1, 'Only one learning mutation per command').refine(value => !value.cycleReplay || Boolean(value.historyMode),
  'Cycle changes are only accepted during history replay');
export type DailyFlowCommitArgs = z.infer<typeof dailyFlowCommitSchema>;
export type DailyFlowLearningReceipt = Pick<WorkspaceNodeSnapshot, 'reading' | 'review'>;
export type DailyFlowResult = { mode?: DailyFlowOpenArgs['mode']; sourceSession?: DailyFlowSession; replayed?: boolean; mutationTimestamp?: string; learning?: Record<string, DailyFlowLearningReceipt> | undefined; session: DailyFlowSession; readings?: { nodeId: string; reading: NonNullable<ReviewQueueNode['reading']> | null }[]; card?: SchedulerCard | null };
