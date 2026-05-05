import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncObjects';

import {
  canonicalCompanionNodePayload,
  sha256Hex,
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

interface PersistCompanionTopicContentArgs {
  content: string;
  deviceId: string;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}

function isEditableTopic(snapshot: WorkspaceSnapshot, node: WorkspaceNodeSnapshot | undefined) {
  return Boolean(
    node &&
    node.kind === 'topic' &&
    !node.deletedAt &&
    !snapshot.trashedNodeIds.includes(node.id)
  );
}

export async function persistCompanionTopicContent(args: PersistCompanionTopicContentArgs) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !isEditableTopic(args.snapshot, node)) {
    return null;
  }
  if (!node?.currentVersionId) {
    throw new Error('Topic edit requires a synced base version.');
  }
  const updatedNode: WorkspaceNodeSnapshot = {
    ...node!,
    bodyBlobHash: null,
    bodyStatus: undefined,
    content: args.content,
    updatedAt: new Date().toISOString()
  };
  const contentHash = await sha256Hex(JSON.stringify(canonicalCompanionNodePayload(updatedNode)));
  const nodeVersion = toCompanionNativeNodeVersion(updatedNode, args.deviceId, contentHash);
  const versionedNode = { ...updatedNode, currentVersionId: nodeVersion.version_id };
  await applyCompanionSyncNodeVersions([nodeVersion]);
  return {
    nodeId: versionedNode.id,
    snapshot: {
      ...args.snapshot,
      nodesById: { ...args.snapshot.nodesById, [versionedNode.id]: versionedNode }
    }
  };
}
