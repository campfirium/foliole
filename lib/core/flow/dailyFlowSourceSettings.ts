import { z } from 'zod';

import { hasDeletedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import { READING_STATES } from '../review/readingState.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { scopedDailyLearningSnapshot } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { sourceSettingsReleasedRows } from './dailyFlowSourceSettingsCycle.js';
import { sourceSettingsReadingChanges, sourceSettingsReadingReceipt } from './dailyFlowSourceSettingsLearning.js';
import { insertCycleRows, readCycleRows, readDailyFlow } from './dailyFlowStorage.js';

const source = z.object({ manualChildOrder: z.array(z.string()).nullable(), sequentialReadingEnabled: z.boolean().nullable() }).strict();
export const dailyFlowSourceSettingsSchema = z.object({ scope: z.string().min(1), sourceNodeId: z.string().min(1), now: z.string().datetime(),
  before: source, after: source, defaultPriority: z.number().int().min(0).max(10), readings: z.array(z.object({ nodeId: z.string().min(1),
    before: z.enum(READING_STATES).nullable(), after: z.enum(['active', 'locked']) }).strict()) }).strict();
export type DailyFlowSourceSettingsArgs = z.infer<typeof dailyFlowSourceSettingsSchema>;

// Change only source preferences and guarded learning facts; never rewrite a body snapshot.
export function saveDailyFlowSourceSettings(db: DbPort, args: DailyFlowSourceSettingsArgs,
  persistence: DailyFlowPersistence, hostName: string, scope: string) {
  if (args.scope !== scope) return Promise.reject(new Error('daily_flow_library_changed'));
  return db.transaction(async tx => {
    const [row] = await tx.query<{ manual_child_order: string | null; sequential_reading_enabled: number | null; deleted_at: string | null }>(
      'SELECT manual_child_order, sequential_reading_enabled, deleted_at FROM nodes WHERE id=?', [args.sourceNodeId]);
    if (!row || row.deleted_at) throw new Error('daily_flow_source_changed');
    const actual = { manualChildOrder: row.manual_child_order ? JSON.parse(row.manual_child_order) : null,
      sequentialReadingEnabled: row.sequential_reading_enabled === null ? null : Boolean(row.sequential_reading_enabled) };
    const ids = args.readings.map(value => value.nodeId);
    const snapshot = await scopedDailyLearningSnapshot(tx, persistence, [args.sourceNodeId, ...ids]);
    if (dailyFlowSourceSettingsAlreadySaved(snapshot, actual, args, scope)) return sourceSettingsReadingReceipt(snapshot, args);
    await tx.run(`UPDATE nodes SET manual_child_order=?, sequential_reading_enabled=?, updated_at=?,
      last_modified_by_host_name=?, sync_dirty=1 WHERE id=?`, [args.after.manualChildOrder === null ? null : JSON.stringify(args.after.manualChildOrder),
      args.after.sequentialReadingEnabled === null ? null : Number(args.after.sequentialReadingEnabled), args.now, hostName, args.sourceNodeId]);
    const changes = sourceSettingsReadingChanges(snapshot, args);
    for (const value of changes) await persistence.reading(tx, value, args.now);
    const released = sourceSettingsReleasedRows(await readDailyFlow(tx), await readCycleRows(tx, ids), args.readings);
    if (released) {
      await insertCycleRows(tx, released.rows);
      await tx.run('UPDATE daily_flow_state SET session_json=?, invalidated=1 WHERE id=1',
        [JSON.stringify({ ...released.session, daily: undefined })]);
    }
    return { readings: changes.map(value => ({ nodeId: value.nodeId, reading: value.after })) };
  });
}

export function dailyFlowSourceSettingsAlreadySaved(snapshot: DailyFlowLearningSnapshot,
  actual: DailyFlowSourceSettingsArgs['before'], args: DailyFlowSourceSettingsArgs, scope: string) {
  if (args.scope !== scope) throw new Error('daily_flow_library_changed');
  const sourceNode = snapshot.nodesById[args.sourceNodeId];
  if (!sourceNode || snapshot.trashedNodeIds.includes(args.sourceNodeId) || hasDeletedAncestor(sourceNode, snapshot.nodesById)) throw new Error('daily_flow_source_changed');
  const matches = (side: 'before' | 'after') => actual.sequentialReadingEnabled === args[side].sequentialReadingEnabled &&
    JSON.stringify(actual.manualChildOrder) === JSON.stringify(args[side].manualChildOrder) && args.readings.every(value =>
    snapshot.nodesById[value.nodeId] && !snapshot.trashedNodeIds.includes(value.nodeId) &&
    !hasDeletedAncestor(snapshot.nodesById[value.nodeId]!, snapshot.nodesById) &&
    (snapshot.nodesById[value.nodeId]!.reading?.state ?? null) === value[side]);
  if (matches('after')) return true;
  if (!matches('before')) throw new Error('daily_flow_source_changed');
  return false;
}

export type DailyFlowSourceSettingsResult = ReturnType<typeof sourceSettingsReadingReceipt>;
