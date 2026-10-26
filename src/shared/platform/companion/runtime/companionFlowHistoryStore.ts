import { z } from 'zod';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { ACTION_HISTORY_LIMIT, createEmptyWorkspaceActionHistory } from '../../../../store/workspaceActionHistoryState';
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
    beforeReview: review.nullable(), afterReview: review.nullable(), reviewOpId: z.string().optional() }).transform(value => definedProps(value)),
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

export async function readCompanionFlowHistoryAvailability(db: DbPort, key: string) {
  const rows = await db.query<{ can_undo: number; can_redo: number }>(`SELECT
    json_array_length(value, '$.undoStack') > 0 AS can_undo,
    json_array_length(value, '$.redoStack') > 0 AS can_redo
    FROM companion_meta WHERE key = ?`, [key]);
  return { canUndo: rows[0]?.can_undo === 1, canRedo: rows[0]?.can_redo === 1 };
}

export async function writeCompanionFlowHistory(db: DbPort, key: string, value: Pick<ReturnType<typeof createEmptyWorkspaceActionHistory<CompanionWorkspaceHistoryEntry>>, 'undoStack' | 'redoStack'>) {
  await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, JSON.stringify({ undoStack: value.undoStack, redoStack: value.redoStack }), new Date().toISOString()]);
}

export async function appendCompanionFlowHistory(db: DbPort, key: string, value: CompanionWorkspaceHistoryEntry) {
  const result = await db.run(`INSERT INTO companion_meta (key, value, updated_at)
    VALUES (?, json_object('undoStack', json_array(json(?)), 'redoStack', json_array()), ?)
    ON CONFLICT(key) DO UPDATE SET value = (
      WITH RECURSIVE retained(undo, excess) AS (
        SELECT json_extract(companion_meta.value, '$.undoStack'),
          MAX(0, json_array_length(companion_meta.value, '$.undoStack') + 1 - ?)
        UNION ALL
        SELECT json_remove(undo, '$[0]'), excess - 1 FROM retained WHERE excess > 0
      )
      SELECT json_object('undoStack', json_insert(undo, '$[#]',
        json_extract(excluded.value, '$.undoStack[0]')), 'redoStack', json_array())
      FROM retained WHERE excess = 0
    ), updated_at = excluded.updated_at
    WHERE json_type(companion_meta.value, '$.undoStack') = 'array'
      AND json_type(companion_meta.value, '$.redoStack') = 'array'`,
  [key, JSON.stringify(value), new Date().toISOString(), ACTION_HISTORY_LIMIT]);
  if (!result.changes) throw new Error('flow_history_unavailable');
}
