import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import type { WorkspaceState } from './workspaceStore';

export type WorkspaceHistoryApplyResult =
  | {
      entry: WorkspaceActionHistoryEntry;
      patch: Partial<WorkspaceState>;
      status: 'applied';
    }
  | { status: 'failed' }
  | { status: 'invalid' };

export function appliedWorkspaceHistory(
  entry: WorkspaceActionHistoryEntry,
  patch: Partial<WorkspaceState>
): WorkspaceHistoryApplyResult {
  return { entry, patch, status: 'applied' };
}
