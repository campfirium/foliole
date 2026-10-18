import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { getCompanionRuntimeCapability } from '../companionRuntimeCapabilities';
import { readWebSyncState, writeWebSyncState } from '../companionWorkspaceSyncState';
import { registerWorkspaceAttachmentResources } from '../runtime/workspaceAttachmentResourceRegistry';

import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionContentProjection, mergeCompanionContentProjection } from './sync/workspace-state/companionContentProjection';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

// Native mutations have already committed; only the Web preview stores a supplied projection.
export async function refreshCompanionWorkspaceAfterMutation(previewSnapshot?: WorkspaceSnapshot | null, contentNodeId?: string) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') {
    const owner = getIosCompanionDatabaseOwner();
    const snapshot = contentNodeId && previewSnapshot
      ? mergeCompanionContentProjection(previewSnapshot, await owner.readSnapshot(db =>
        loadCompanionContentProjection(db, contentNodeId)))
      : await owner.readSnapshot(loadIosCompanionWorkspaceSnapshot) as WorkspaceSnapshot | null;
    registerWorkspaceAttachmentResources(snapshot);
    return snapshot;
  }
  const current = readWebSyncState();
  if (previewSnapshot === undefined) return current.workspace_snapshot;
  return writeWebSyncState({ ...current, workspace_snapshot: previewSnapshot }).workspace_snapshot;
}
