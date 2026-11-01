import { compactFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';

import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { applyWorkspaceDeleteHistory } from './workspaceDeleteHistoryApply';
import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult, type WorkspaceHistoryExecution } from './workspaceHistoryApplyResult';
import type { WorkspaceState } from './workspaceStoreTypes';

export interface WorkspaceRestoreHistoryEntry {
  id: string;
  title: string;
  type: 'workspace.restore';
  deletion: WorkspaceDeleteHistoryEntry;
}
export async function applyWorkspaceRestoreHistory(args: {
  entry: WorkspaceRestoreHistoryEntry; mode: 'undo' | 'redo'; get: () => WorkspaceState;
  mutationTimestamp: string; execution?: WorkspaceHistoryExecution;
}): Promise<WorkspaceHistoryApplyResult> {
  const wrap = (entry: WorkspaceActionHistoryEntry): WorkspaceRestoreHistoryEntry => entry.type === 'workspace.delete'
    ? { ...args.entry, deletion: compactFlowHistoryEntry(entry) } : args.entry;
  const result = await applyWorkspaceDeleteHistory({ ...args, entry: args.entry.deletion,
    mode: args.mode === 'undo' ? 'redo' : 'undo',
    ...(args.execution ? { execution: { beforeSubmit: args.execution.beforeSubmit,
      committed: entry => args.execution!.committed(wrap(entry)) } } : {}) });
  return result.status === 'applied' ? appliedWorkspaceHistory(wrap(result.entry), result.patch) : result;
}
