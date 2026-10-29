import type { DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import { saveDailyFlowSourceSettingsRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import type { WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';

export function saveDatabaseShelveCommand(entry: WorkspaceTopicShelveHistoryEntry, mode: 'undo' | 'redo',
  now: string, before: DailyFlowSourceSettingsArgs['before'], knownNodes: Record<string, unknown>) {
  const mutation = entry.databaseMutation!;
  return saveDailyFlowSourceSettingsRuntime({ scope: mutation.scope, sourceNodeId: entry.nodeId, now,
    before, after: { ...before, shelvedAt: mode === 'undo' ? entry.beforeShelvedAt : entry.afterShelvedAt },
    defaultPriority: mutation.defaultPriority, readings: [],
    guardedReadings: (entry.relatedReadings ?? []).map(value => ({ nodeId: value.nodeId,
      before: (mode === 'undo' ? value.afterReading : value.beforeReading) ?? null,
      after: (mode === 'undo' ? value.beforeReading : value.afterReading) ?? null })) }, knownNodes);
}
