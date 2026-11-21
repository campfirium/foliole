
import type { DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import { getBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { saveDailyFlowSourceSettingsRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError, logRuntimeWarning } from '../shared/platform/runtimeLogging';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { isSameNodeReading } from './workspaceNodeLearningComparison';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
export const sourcePreferences = (node: WorkspaceState['nodesById'][string]) => ({
  shelvedAt: node.shelvedAt ?? null, manualChildOrder: node.manualChildOrder ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null
});

const SOURCE_PREFERENCE_KEYS = ['manualChildOrder', 'sequentialReadingEnabled', 'shelvedAt'] as const;

function changedSourceSettings(before: DailyFlowSourceSettingsArgs['before'], after: DailyFlowSourceSettingsArgs['after']) {
  return SOURCE_PREFERENCE_KEYS
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export function flowSourceSettingsConflictReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('daily_flow_library_changed')) return 'library_changed';
  const match = /daily_flow_source_changed(?::\s*([a-z_]+))?/u.exec(message);
  return match ? match[1] ?? 'source_changed' : null;
}

type SourcePreferences = DailyFlowSourceSettingsArgs['after'];
type SourceNodes = WorkspaceState['nodesById'];
/** Plans reading changes from nodes whose source still shows the last saved preferences. */
export type PlanFlowSourceReadings = (confirmedNodes: SourceNodes) => DailyFlowSourceSettingsArgs['readings'] | null;
interface PendingSourceSaves {
  /** The source as last saved; only its preference fields are read. */
  confirmed: SourceNodes[string];
  latest: number;
  tail: Promise<boolean>;
}
// The runtime guard compares each save against the stored row, so saves for one source must not overlap.
const pendingSourceSaves = new Map<string, PendingSourceSaves>();
const samePreferences = (left: SourcePreferences, right: SourcePreferences) => JSON.stringify(left) === JSON.stringify(right);
function withPreferencesOf(node: SourceNodes[string], from: SourceNodes[string]): SourceNodes[string] {
  const next = { ...node };
  for (const key of SOURCE_PREFERENCE_KEYS) delete next[key];
  return {
    ...next,
    ...(from.manualChildOrder === undefined ? {} : { manualChildOrder: from.manualChildOrder }),
    ...(from.sequentialReadingEnabled === undefined ? {} : { sequentialReadingEnabled: from.sequentialReadingEnabled }),
    ...(from.shelvedAt === undefined ? {} : { shelvedAt: from.shelvedAt })
  };
}

function showSourcePreferences(set: Set, sourceNodeId: string, shown: SourcePreferences, next: (node: SourceNodes[string]) => SourceNodes[string]) {
  set(state => {
    const node = state.nodesById[sourceNodeId];
    if (!node || !samePreferences(sourcePreferences(node), shown)) return state;
    return { nodesById: { ...state.nodesById, [sourceNodeId]: next(node) } };
  });
}

/** Shows the change at once, then saves it after any earlier save for the same source settles. */
export function saveWorkspaceFlowSourceSettings(set: Set, get: () => WorkspaceState, sourceNodeId: string,
  after: SourcePreferences, planReadings: PlanFlowSourceReadings, now: string): Promise<boolean> {
  const source = get().nodesById[sourceNodeId];
  if (!source) return Promise.resolve(false);
  const entry = pendingSourceSaves.get(sourceNodeId) ?? { confirmed: source, latest: 0, tail: Promise.resolve(true) };
  pendingSourceSaves.set(sourceNodeId, entry);
  const ticket = ++entry.latest;
  // The browser runtime saves into a private workspace copy published on success, so only native saves show early.
  if (!getBrowserDailyFlowRuntime()) showSourcePreferences(set, sourceNodeId, sourcePreferences(source), node => ({ ...node, ...after }));
  const run = entry.tail.then(() => persistFlowSourceSettings(set, get, entry, ticket, sourceNodeId, after, planReadings, now))
    .finally(() => { if (entry.latest === ticket) pendingSourceSaves.delete(sourceNodeId); });
  entry.tail = run;
  return run;
}

async function persistFlowSourceSettings(set: Set, get: () => WorkspaceState, entry: PendingSourceSaves, ticket: number,
  sourceNodeId: string, after: SourcePreferences, planReadings: PlanFlowSourceReadings, now: string) {
  const before = get();
  const confirmed = sourcePreferences(entry.confirmed);
  const revert = () => { if (entry.latest === ticket) showSourcePreferences(set, sourceNodeId, after, node => withPreferencesOf(node, entry.confirmed)); };
  try {
    const shown = before.nodesById[sourceNodeId];
    if (!shown) throw new Error('daily_flow_source_changed: source_missing');
    const confirmedNodes = samePreferences(sourcePreferences(shown), confirmed)
      ? before.nodesById : { ...before.nodesById, [sourceNodeId]: withPreferencesOf(shown, entry.confirmed) };
    const readings = planReadings(confirmedNodes);
    if (!readings) { revert(); return false; }
    const scope = before.libraryScope ?? before.reviewSession.daily?.scope;
    if (!scope) throw new Error('daily_flow_library_missing');
    const result = await saveDailyFlowSourceSettingsRuntime({ scope, sourceNodeId, now, before: confirmed, after, readings,
      defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority }, confirmedNodes);
    if (get().libraryScope !== before.libraryScope) return false;
    entry.confirmed = { ...entry.confirmed, ...after };
    set(state => {
      const merged = { ...state.nodesById };
      for (const value of result.readings) {
        const node = merged[value.nodeId];
        if (node && isSameNodeReading(node, before.nodesById[value.nodeId])) merged[value.nodeId] = { ...node, reading: value.reading };
      }
      const current = merged[sourceNodeId];
      if (current && samePreferences(sourcePreferences(current), after)) {
        merged[sourceNodeId] = { ...current, ...after, updatedAt: result.updatedAt };
      }
      return { nodesById: merged };
    });
    if (get().reviewSession.daily) await openWorkspaceDailyFlow(set, get, { now, mode: get().reviewSessionMode,
      refresh: true, prepareOnly: !get().reviewSession.sessionStartedAt }, undefined, true);
    return true;
  } catch (error) {
    const context = { area: 'persistence' as const, action: 'save_daily_flow_source_settings', error,
      changed_settings: changedSourceSettings(confirmed, after), source_node_id: sourceNodeId };
    const conflict = flowSourceSettingsConflictReason(error);
    // A stale or removed source is the guard working as designed, not a storage fault.
    if (conflict) logRuntimeWarning('flow source settings save conflict', { ...context, reason: conflict });
    else logRuntimeError('could not save Flow source settings', context);
    revert();
    showAppRuntimeNotice(translate(getStoredAppLocale(), 'shared.flowSourceSettings.saveFailed'));
    return false;
  }
}
