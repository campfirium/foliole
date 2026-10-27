import { dailyFlowSourceSettingsAlreadySaved, type DailyFlowSourceSettingsArgs } from '../../../../lib/core/flow/dailyFlowSourceSettings';
import type { BrowserWorkspaceCandidate } from '../../../store/workspaceBrowserCandidate';

import { createBrowserDailyFlowStore } from './browserDailyFlowStore';

export async function saveBrowserFlowSourceSettings(candidate: BrowserWorkspaceCandidate,
  args: DailyFlowSourceSettingsArgs, scope: string) {
  const source = candidate.get().nodesById[args.sourceNodeId];
  if (!source) throw new Error('daily_flow_source_changed');
  const store = createBrowserDailyFlowStore(candidate.storageGet, candidate.storageSet);
  const snapshot = await store.scopedLearningSnapshot([args.sourceNodeId, ...args.readings.map(value => value.nodeId)]);
  const actual = { manualChildOrder: source.manualChildOrder ?? null, sequentialReadingEnabled: source.sequentialReadingEnabled ?? null };
  if (dailyFlowSourceSettingsAlreadySaved(snapshot, actual, args, scope)) return true;
  candidate.set(state => ({ nodesById: { ...state.nodesById,
    [source.id]: { ...source, ...args.after, updatedAt: args.now } } }));
  for (const value of args.readings) await store.reading(value, args.now);
  const flow = candidate.get().browserDailyFlow;
  if (flow?.state) candidate.set({ browserDailyFlow: { ...flow, state: { ...flow.state, invalidated: 1 } } });
  return true;
}
