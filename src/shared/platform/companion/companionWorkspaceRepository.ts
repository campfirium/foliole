import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../companionRuntimeCapabilities';
import { readWebSyncState, writeWebSyncState } from '../companionWorkspaceSyncState';

import { refreshCompanionWorkspaceSnapshot } from './companionWorkspaceSnapshotRefresh';

// Database mutations have already committed; only the database-less Web shell stores a supplied projection.
export async function refreshCompanionWorkspaceAfterMutation(previewSnapshot?: WorkspaceSnapshot | null, contentNodeId?: string) {
  if (hasCompanionLocalDatabase(getCompanionRuntimeCapability())) {
    // A read-only preflight consumes committed scopes without inventing a mutation.
    // Supplied mutation projections still require a complete native read unless scoped.
    const snapshot = await refreshCompanionWorkspaceSnapshot(contentNodeId
      ? { kind: 'nodes', nodeIds: [contentNodeId] }
      : previewSnapshot === undefined ? undefined : { kind: 'full' });
    return snapshot;
  }
  const current = readWebSyncState();
  if (previewSnapshot === undefined) return current.workspace_snapshot;
  return writeWebSyncState({ ...current, workspace_snapshot: previewSnapshot }).workspace_snapshot;
}

export async function refreshCompanionWorkspaceAfterSync() {
  return hasCompanionLocalDatabase(getCompanionRuntimeCapability())
    ? refreshCompanionWorkspaceSnapshot() : readWebSyncState().workspace_snapshot;
}
