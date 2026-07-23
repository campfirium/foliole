import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { saveCompanionSyncNodeOpenState } from '../shared/platform/companionSyncObjects';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function markSnapshotNodeOpened(snapshot: WorkspaceSnapshot, nodeId: string, lastOpenedAt: string): WorkspaceSnapshot {
  return {
    ...snapshot,
    nodeOpenStateById: {
      ...snapshot.nodeOpenStateById,
      [nodeId]: { lastOpenedAt, nodeId }
    }
  };
}

export async function markCompanionNodeOpened(args: {
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  if (!args.snapshot || !isCanonicalVisibleNodeId(args.snapshot, args.nodeId)) {
    return;
  }
  const lastOpenedAt = new Date().toISOString();
  const persisted = await saveCompanionSyncNodeOpenState({ lastOpenedAt, nodeId: args.nodeId });
  if (!persisted) return;
  await args.workspaceSync.replaceSnapshot(
    markSnapshotNodeOpened(args.snapshot, args.nodeId, persisted.last_opened_at),
    args.nodeId
  );
}
