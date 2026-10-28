import { hasDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { hasFlowDayChanged, isSameFlowActionTarget } from './workspaceFlowDay';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

export async function prepareWorkspaceFlowDay(set: Set, get: () => WorkspaceState, now: string) {
  const before = get();
  if (!hasDailyFlowRuntime()) return false;
  if (before.reviewSession.daily && !hasFlowDayChanged(before.reviewSession, now)) return true;
  const target = before.reviewSession.currentNodeId;
  const node = target ? before.nodesById[target] : undefined;
  const opened = await openWorkspaceDailyFlow(set, get, { now, mode: before.reviewSessionMode }, undefined, true);
  const current = get();
  return Boolean(opened && target && current.libraryScope === before.libraryScope &&
    current.reviewSessionMode === before.reviewSessionMode && current.reviewSession.currentNodeId === target &&
    isSameFlowActionTarget(node, current.nodesById[target]));
}
