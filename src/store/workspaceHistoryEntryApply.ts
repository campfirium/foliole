import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { applyWorkspaceDeleteHistory } from './workspaceDeleteHistoryApply';
import type { WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import { createWorkspaceHistoryMutationTimestamp } from './workspaceHistoryTimestamp';
import { applyWorkspaceReadingHistory } from './workspaceReadingHistoryApply';
import { applyWorkspaceReviewGradeHistory } from './workspaceReviewGradeHistoryApply';
import { applyWorkspaceShelveHistory } from './workspaceShelveHistoryApply';
import type { WorkspaceState } from './workspaceStore';
import { applyWorkspaceStructureHistoryEntry } from './workspaceStructureHistoryEntryApply';

export function applyWorkspaceHistoryEntry(args: {
  entry: WorkspaceActionHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
}): Promise<WorkspaceHistoryApplyResult> {
  const mutationTimestamp = createWorkspaceHistoryMutationTimestamp(
    'mutationTimestamp' in args.entry ? args.entry.mutationTimestamp : null
  );
  if (args.entry.type === 'topic.dismiss') {
    return applyWorkspaceReadingHistory({ ...args, entry: args.entry, mutationTimestamp });
  }
  if (args.entry.type === 'topic.shelve') {
    return applyWorkspaceShelveHistory({ ...args, entry: args.entry, mutationTimestamp });
  }
  if (args.entry.type === 'review.grade') {
    return applyWorkspaceReviewGradeHistory({ ...args, entry: args.entry, mutationTimestamp });
  }
  if (args.entry.type === 'workspace.delete') {
    return applyWorkspaceDeleteHistory({ ...args, entry: args.entry, mutationTimestamp });
  }
  return applyWorkspaceStructureHistoryEntry({ ...args, entry: args.entry });
}
