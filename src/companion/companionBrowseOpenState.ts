import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function markSnapshotNodeOpened(snapshot: WorkspaceSnapshot, nodeId: string, updatedAt: string): WorkspaceSnapshot {
  const existing = snapshot.persistedNodeViewById?.[nodeId];
  return {
    ...snapshot,
    persistedNodeViewById: {
      ...snapshot.persistedNodeViewById,
      [nodeId]: {
        nodeId,
        scrollTop: existing?.scrollTop ?? 0,
        selectionFrom: existing?.selectionFrom ?? null,
        selectionTo: existing?.selectionTo ?? null,
        source: 'user-scroll',
        updatedAt
      }
    }
  };
}

export async function markCompanionNodeOpened(args: {
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  if (!args.snapshot?.nodesById[args.nodeId] || args.snapshot.trashedNodeIds.includes(args.nodeId)) {
    return;
  }
  const existing = args.snapshot.persistedNodeViewById?.[args.nodeId];
  await saveCompanionSyncNodeViewState({
    nodeId: args.nodeId,
    scrollTop: existing?.scrollTop ?? 0
  });
  await args.workspaceSync.replaceSnapshot(
    markSnapshotNodeOpened(args.snapshot, args.nodeId, new Date().toISOString()),
    args.nodeId
  );
}
