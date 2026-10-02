import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from './companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { readWebSyncState, writeWebSyncState } from './companionWorkspaceSyncState';
import { registerWorkspaceAttachmentResources } from './runtime/workspaceAttachmentResourceRegistry';

// Native mutations have already committed; only the Web preview stores a supplied projection.
export async function refreshCompanionWorkspaceAfterMutation(previewSnapshot?: WorkspaceSnapshot | null) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') {
    const snapshot = await getIosCompanionDatabaseOwner().read(loadIosCompanionWorkspaceSnapshot) as WorkspaceSnapshot | null;
    registerWorkspaceAttachmentResources(snapshot);
    return snapshot;
  }
  const current = readWebSyncState();
  if (previewSnapshot === undefined) return current.workspace_snapshot;
  return writeWebSyncState({ ...current, workspace_snapshot: previewSnapshot }).workspace_snapshot;
}
