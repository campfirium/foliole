import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import type { WorkspaceState } from './workspaceStore';
import {
  applyWorkspaceStructureHistory,
  isWorkspaceStructureHistoryApplicable
} from './workspaceStructureHistoryApply';
import type { WorkspaceStructureHistoryEntry } from './workspaceStructureHistoryTypes';

export async function applyWorkspaceStructureHistoryEntry(args: {
  entry: WorkspaceStructureHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
}): Promise<WorkspaceHistoryApplyResult> {
  if (!isWorkspaceStructureHistoryApplicable(args.get(), args.entry, args.mode)) {
    return { status: 'invalid' };
  }
  const patch = await applyWorkspaceStructureHistory(args);
  if (patch) return appliedWorkspaceHistory(args.entry, patch);
  return isWorkspaceStructureHistoryApplicable(args.get(), args.entry, args.mode)
    ? { status: 'failed' }
    : { status: 'invalid' };
}
