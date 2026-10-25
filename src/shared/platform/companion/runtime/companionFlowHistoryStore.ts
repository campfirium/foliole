import { z } from 'zod';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createEmptyWorkspaceActionHistory, pushWorkspaceUndoEntry } from '../../../../store/workspaceActionHistoryState';
import { workspaceHistorySessionSchema as session } from '../../../../store/workspaceHistorySessionSchema';
import { workspaceNodeMetadataHistorySchema, workspaceHistoryReadingSchema as reading, type WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';
import type { FlowHistoryEntry } from '../../../../store/workspaceReviewHistoryTarget';
import { definedProps } from '../../../lib/definedProps';

const review = z.object({ due: z.string(), lastReviewAt: z.string().nullable(), state: z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), stability: z.number(), difficulty: z.number(),
elapsedDays: z.number(), scheduledDays: z.number(), reps: z.number(), lapses: z.number() });


const context = z.object({ activeNodeId: z.string().nullable(), browseRootNodeId: z.string(), reviewSession: session });
const common = { id: z.string(), mutationTimestamp: z.string(), nodeId: z.string(), beforeContext: context, afterContext: context };
const flowEntry = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('review.grade'), title: z.literal('Grade Review'),
    beforeReview: review.nullable(), afterReview: review, reviewOpId: z.string().optional() }).transform(value => definedProps(value)),
  z.object({ ...common, type: z.literal('topic.dismiss'), title: z.enum([
    'Read Topic', 'Later Topic', 'Soon Topic', 'Postpone Topic', 'Dismiss Topic']),
  beforeReading: reading.nullable(), afterReading: reading.nullable(), relatedReadings: z.array(z.object({
    nodeId: z.string(), beforeReading: reading.nullable(), afterReading: reading.nullable() })).optional() }).transform(value => definedProps(value))
]);
export type CompanionWorkspaceHistoryEntry = FlowHistoryEntry | WorkspaceNodeMetadataHistoryEntry;
const entry = z.union([flowEntry, workspaceNodeMetadataHistorySchema]);
const history = z.object({ undoStack: z.array(entry), redoStack: z.array(entry) });

export function companionFlowHistoryKey(libraryScope: string) {
  return `flow_history:${JSON.stringify([libraryScope, false])}`;
}

export async function readCompanionFlowHistory(db: DbPort, key: string) {
  const rows = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key = ?', [key]);
  const stored = rows[0];
  return { ...createEmptyWorkspaceActionHistory<CompanionWorkspaceHistoryEntry>(), ...(stored ? history.parse(JSON.parse(stored.value)) : {}) };
}

export async function writeCompanionFlowHistory(db: DbPort, key: string, value: Pick<ReturnType<typeof createEmptyWorkspaceActionHistory<CompanionWorkspaceHistoryEntry>>, 'undoStack' | 'redoStack'>) {
  await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, JSON.stringify({ undoStack: value.undoStack, redoStack: value.redoStack }), new Date().toISOString()]);
}

export async function appendCompanionFlowHistory(db: DbPort, key: string, value: CompanionWorkspaceHistoryEntry) {
  const next = pushWorkspaceUndoEntry(await readCompanionFlowHistory(db, key), value);
  await writeCompanionFlowHistory(db, key, next);
}
