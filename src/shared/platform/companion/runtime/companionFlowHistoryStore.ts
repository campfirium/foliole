import { z } from 'zod';

import { READING_STATES } from '../../../../../lib/core/review/readingState';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createEmptyWorkspaceActionHistory, pushWorkspaceUndoEntry } from '../../../../store/workspaceActionHistoryState';
import type { FlowHistoryEntry } from '../../../../store/workspaceReviewHistoryTarget';
import { definedProps } from '../../../lib/definedProps';

const review = z.object({ due: z.string(), lastReviewAt: z.string().nullable(), state: z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), stability: z.number(), difficulty: z.number(),
elapsedDays: z.number(), scheduledDays: z.number(), reps: z.number(), lapses: z.number() });
const reading = z.object({ intervalDurationMs: z.number(), intervalGrowthFactor: z.number(),
  lastHandledAt: z.string(), nextAt: z.string(), priority: z.number(), readingPosition: z.number(),
  repetitionCount: z.number(), state: z.enum(READING_STATES) });
const session = z.object({ currentNodeId: z.string().nullable(), isAnswerRevealed: z.boolean(),
  queueNodeIds: z.array(z.string()), totalNodeCount: z.number(), completedAt: z.string().nullable().optional(),
  continueNodeId: z.string().nullable().optional(), currentItemStartedAt: z.string().nullable().optional(),
  readingElapsedMs: z.number().optional(), readTopicCount: z.number().optional(), reviewElapsedMs: z.number().optional(),
  reviewedItemCount: z.number().optional(), nextReviewDueAt: z.string().nullable().optional(),
  sessionStartedAt: z.string().nullable().optional(), soonNodeIds: z.array(z.string()).optional() }).transform(value => definedProps(value));
const context = z.object({ activeNodeId: z.string().nullable(), browseRootNodeId: z.string(), reviewSession: session });
const common = { id: z.string(), mutationTimestamp: z.string(), nodeId: z.string(), beforeContext: context, afterContext: context };
const entry = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('review.grade'), title: z.literal('Grade Review'),
    beforeReview: review.nullable(), afterReview: review }),
  z.object({ ...common, type: z.literal('topic.dismiss'), title: z.enum([
    'Read Topic', 'Later Topic', 'Soon Topic', 'Postpone Topic', 'Dismiss Topic']),
  beforeReading: reading.nullable(), afterReading: reading.nullable(), relatedReadings: z.array(z.object({
    nodeId: z.string(), beforeReading: reading.nullable(), afterReading: reading.nullable() })).optional() }).transform(value => definedProps(value))
]);
const history = z.object({ undoStack: z.array(entry), redoStack: z.array(entry) });

export function companionFlowHistoryKey(libraryScope: string, onlyReview: boolean) {
  return `flow_history:${JSON.stringify([libraryScope, onlyReview])}`;
}

export async function readCompanionFlowHistory(db: DbPort, key: string) {
  const rows = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key = ?', [key]);
  const stored = rows[0];
  return { ...createEmptyWorkspaceActionHistory(), ...(stored ? history.parse(JSON.parse(stored.value)) : {}) };
}

export async function writeCompanionFlowHistory(db: DbPort, key: string, value: Pick<ReturnType<typeof createEmptyWorkspaceActionHistory>, 'undoStack' | 'redoStack'>) {
  await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, JSON.stringify({ undoStack: value.undoStack, redoStack: value.redoStack }), new Date().toISOString()]);
}

export async function appendCompanionFlowHistory(db: DbPort, key: string, value: FlowHistoryEntry) {
  const next = pushWorkspaceUndoEntry(await readCompanionFlowHistory(db, key), value);
  await writeCompanionFlowHistory(db, key, next);
}
