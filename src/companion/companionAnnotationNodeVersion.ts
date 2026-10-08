import {
  canonicalWorkspaceNodePayload,
  toWorkspaceNativeNodeVersion
} from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { assertNodeTextForSave } from '../shared/ui/nodeTextSaveBudget';

export const canonicalCompanionNodePayload = canonicalWorkspaceNodePayload;

export function toCompanionNativeNodeVersion(
  node: WorkspaceNodeSnapshot,
  hostName: string,
  versionId?: string
) {
  if (!node.deletedAt) assertNodeTextForSave(node);
  return toWorkspaceNativeNodeVersion(
    node,
    hostName,
    versionId ?? createOpaqueVersionRef(createCompanionUuid())
  );
}
