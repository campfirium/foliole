import { remapStoredTextAnchorLink } from '../../lib/core/database/storedAnchorLinkRemap';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncObjects';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import {
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
    isCanonicalVisibleNodeId(snapshot, node.id)
  );
}

function areJsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function toVersionedNode(args: {
  deviceId: string;
  node: WorkspaceNodeSnapshot;
}) {
  const nodeVersion = await toCompanionNativeNodeVersion(args.node, args.deviceId);
  return {
    node: { ...args.node, currentVersionId: nodeVersion.version_id },
    nodeVersion
  };
}

async function remapCompanionChildAnchorVersions(args: {
  deviceId: string;
  nextContent: string;
  parentNodeId: string;
  previousContent: string;
  snapshot: WorkspaceSnapshot;
  timestamp: string;
}) {
  const versions: NativeSyncNodeRecord[] = [];
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  for (const child of Object.values(args.snapshot.nodesById)) {
    if (child.parentNodeId !== args.parentNodeId || child.deletedAt || !child.anchorLink) {
      continue;
    }
    const remapped = remapStoredTextAnchorLink({
      anchorLink: child.anchorLink,
      nextContent: args.nextContent,
      previousContent: args.previousContent
    });
    if (!remapped || (areJsonEqual(remapped.anchorLink, child.anchorLink) && areJsonEqual(remapped.imageRegions, child.imageRegions))) {
      continue;
    }
    if (!child.currentVersionId) {
      throw new Error('Topic edit anchor remap requires synced child base versions.');
    }
    const versioned = await toVersionedNode({
      deviceId: args.deviceId,
      node: {
        ...child,
        anchorLink: remapped.anchorLink,
        imageRegions: remapped.imageRegions,
        updatedAt: args.timestamp
      }
    });
    nodesById[versioned.node.id] = versioned.node;
    versions.push(versioned.nodeVersion);
  }
  return { nodesById, versions };
}

export async function persistCompanionTopicContent(args: PersistCompanionTopicContentArgs) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !isEditableTopic(args.snapshot, node)) {
    return null;
  }
  if (!node?.currentVersionId) {
    throw new Error('Topic edit requires a synced base version.');
  }
  if (args.content === node.content) {
    return {
      nodeId: node.id,
      snapshot: args.snapshot
    };
  }
  const timestamp = new Date().toISOString();
  const updatedNode: WorkspaceNodeSnapshot = {
    ...node!,
    bodyBlobHash: null,
    content: args.content,
    updatedAt: timestamp
  };
  const parentVersioned = await toVersionedNode({ deviceId: args.deviceId, node: updatedNode });
  const remappedChildren = await remapCompanionChildAnchorVersions({
    deviceId: args.deviceId,
    nextContent: args.content,
    parentNodeId: node.id,
    previousContent: node.content,
    snapshot: args.snapshot,
    timestamp
  });
  await applyCompanionSyncNodeVersions([parentVersioned.nodeVersion, ...remappedChildren.versions]);
  return {
    nodeId: parentVersioned.node.id,
    snapshot: {
      ...args.snapshot,
      nodesById: {
        ...args.snapshot.nodesById,
        [parentVersioned.node.id]: parentVersioned.node,
        ...remappedChildren.nodesById
      }
    }
  };
}
