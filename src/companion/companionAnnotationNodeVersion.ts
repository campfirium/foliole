import {
  canonicalWorkspaceNodePayload,
  toWorkspaceNativeNodeVersion
} from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import { createCompanionUuid } from '../shared/platform/companionUuid';

export const canonicalCompanionNodePayload = canonicalWorkspaceNodePayload;

export function toCompanionNativeNodeVersion(
  node: WorkspaceNodeSnapshot,
  hostName: string,
  versionId?: string
) {
  return toWorkspaceNativeNodeVersion(
    node,
    hostName,
    versionId ?? createOpaqueVersionRef(createCompanionUuid())
  );
}
