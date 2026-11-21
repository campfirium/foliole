import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { saveCompanionSyncNodeOpenState } from '../shared/platform/companionSyncObjects';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import { whenCompanionWorkspaceNodePublished } from './companionWorkspacePreview';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export async function markCompanionNodeOpened(args: {
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  if (!args.snapshot || !isCanonicalVisibleNodeId(args.snapshot, args.nodeId)) {
    return;
  }
  const lastOpenedAt = new Date().toISOString();
  // A node shown ahead of its write has no stored row to record against until that write publishes it.
  if (!await whenCompanionWorkspaceNodePublished(args.nodeId)) return;
  const persisted = await saveCompanionSyncNodeOpenState({ lastOpenedAt, nodeId: args.nodeId });
  if (!persisted) return;
  // The writer registered the committed open record; refresh reads only that record.
  await args.workspaceSync.refreshAfterMutation();
}
