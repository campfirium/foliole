import { compactFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';

import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { moveWorkspaceHistoryCursor } from './workspaceActionHistoryState';
import type { HistoryDirection } from './workspaceApplicationHistory';
import { publishWorkspaceApplicationPayloads } from './workspaceApplicationWorkspaceHistory';
import { applyWorkspaceHistoryEntry } from './workspaceHistoryEntryApply';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export async function replayApplicationWorkspace(args: {
  entry: WorkspaceActionHistoryEntry; mode: HistoryDirection; get: () => WorkspaceState; set: Set;
  beforeSubmit: () => boolean; isCurrent: () => boolean;
}) {
  let receipt: WorkspaceActionHistoryEntry | undefined;
  const before = args.get();
  const result = await applyWorkspaceHistoryEntry({ ...args, execution: {
    beforeSubmit: args.beforeSubmit, committed: entry => { receipt = entry; }
  } });
  const entry = result.status === 'applied' ? result.entry : receipt;
  if (!entry) return null;
  if (args.isCurrent()) args.set(state => {
    const source = before.appActionHistory;
    const domain = { ...source };
    delete domain.application;
    const computed = moveWorkspaceHistoryCursor(domain, entry, args.mode);
    const history = publishWorkspaceApplicationPayloads(state.appActionHistory, computed);
    const patch = result.status === 'applied' ? { ...result.patch } : {};
    if (state.activeNodeId !== before.activeNodeId || state.navigation !== before.navigation) {
      delete patch.activeNodeId;
      delete patch.browseRootNodeId;
      delete patch.navigation;
      delete patch.reviewSession;
    }
    return { ...patch, appActionHistory: history };
  });
  return compactFlowHistoryEntry(entry);
}
