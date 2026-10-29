import { dailyFlowSourceSettingsAlreadySaved, type DailyFlowSourceSettingsArgs } from '../../../../lib/core/flow/dailyFlowSourceSettings';
import { sourceSettingsReleasedRows } from '../../../../lib/core/flow/dailyFlowSourceSettingsCycle';
import { sourceSettingsReadingChanges, sourceSettingsReadingReceipt } from '../../../../lib/core/flow/dailyFlowSourceSettingsLearning';
import type { BrowserWorkspaceCandidate } from '../../../store/workspaceBrowserCandidate';

import { createBrowserDailyFlowStore } from './browserDailyFlowStore';

export async function saveBrowserFlowSourceSettings(candidate: BrowserWorkspaceCandidate,
  args: DailyFlowSourceSettingsArgs, scope: string) {
  const source = candidate.get().nodesById[args.sourceNodeId];
  if (!source) throw new Error('daily_flow_source_changed');
  const store = createBrowserDailyFlowStore(candidate.storageGet, candidate.storageSet);
  const snapshot = await store.scopedLearningSnapshot([args.sourceNodeId, ...args.readings.map(value => value.nodeId)]);
  const actual = { manualChildOrder: source.manualChildOrder ?? null, sequentialReadingEnabled: source.sequentialReadingEnabled ?? null };
  if (dailyFlowSourceSettingsAlreadySaved(snapshot, actual, args, scope)) return sourceSettingsReadingReceipt(snapshot, args);
  candidate.set(state => ({ nodesById: { ...state.nodesById,
    [source.id]: { ...source, ...args.after, updatedAt: args.now } } }));
  const changes = sourceSettingsReadingChanges(snapshot, args);
  for (const value of changes) await store.reading(value, args.now);
  const flow = candidate.get().browserDailyFlow;
  if (flow?.state) {
    const released = sourceSettingsReleasedRows(flow.state, flow.rows, args.readings);
    candidate.set({ browserDailyFlow: { ...flow, rows: [...flow.rows, ...(released?.rows ?? [])],
      state: { ...flow.state, session: released?.session ?? flow.state.session, invalidated: 1 } } });
  }
  return { readings: changes.map(value => ({ nodeId: value.nodeId, reading: value.after })) };
}
