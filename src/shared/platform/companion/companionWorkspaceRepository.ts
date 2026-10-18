import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { getCompanionRuntimeCapability } from '../companionRuntimeCapabilities';
import { readWebSyncState, writeWebSyncState } from '../companionWorkspaceSyncState';
import { registerWorkspaceAttachmentResources } from '../runtime/workspaceAttachmentResourceRegistry';

import { refreshCompanionWorkspaceSnapshot } from './companionWorkspaceSnapshotRefresh';

// Native mutations have already committed; only the Web preview stores a supplied projection.
export async function refreshCompanionWorkspaceAfterMutation(previewSnapshot?: WorkspaceSnapshot | null, contentNodeId?: string) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') {
    const snapshot = await refreshCompanionWorkspaceSnapshot(contentNodeId
      ? { kind: 'nodes', nodeIds: [contentNodeId] } : { kind: 'full' });
    registerWorkspaceAttachmentResources(snapshot);
    return snapshot;
  }
  const current = readWebSyncState();
  if (previewSnapshot === undefined) return current.workspace_snapshot;
  return writeWebSyncState({ ...current, workspace_snapshot: previewSnapshot }).workspace_snapshot;
}

export async function refreshCompanionWorkspaceAfterSync() {
  const runtime = getCompanionRuntimeCapability();
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native'
    ? refreshCompanionWorkspaceSnapshot() : readWebSyncState().workspace_snapshot;
}
