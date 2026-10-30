import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort } from '../../lib/core/sync/dbPort';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { canCreateTopicInside } from '../features/nodes/model/topicCreationParent';
import { runCompanionHistoryMutation } from '../shared/platform/companion/runtime/companionFlowHistory';
import { commitCompanionNodeHistoryWithDb } from '../shared/platform/companion/runtime/companionNodeHistory';
import { persistCompanionShareDelivery } from '../shared/platform/companion/runtime/companionShareDelivery';
import { loadCompanionWorkspaceNode, loadCompanionWorkspaceNodeFromDb } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import {
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

export type CompanionCaptureTextErrorCode = 'empty' | 'inbox-unavailable' | 'target-unavailable';

export class CompanionCaptureTextError extends Error {
  constructor(readonly code: CompanionCaptureTextErrorCode) {
    super(code);
    this.name = 'CompanionCaptureTextError';
  }
}

interface PersistCompanionCapturedTextArgs {
  deviceId: string;
  nodeId?: string;
  now?: string;
  parentNodeId?: string;
  preserveBoundaryWhitespace?: boolean;
  snapshot: WorkspaceSnapshot | null;
  text: string;
  versionId?: string;
}

interface CaptureTextDraft {
  persisted?: boolean;
  node: WorkspaceNodeSnapshot;
  nodeVersion: NativeSyncNodeRecord;
  snapshot: WorkspaceSnapshot;
}

function createCaptureNode(content: string, timestamp: string, nodeId?: string, parentNodeId = INBOX_NODE_ID): WorkspaceNodeSnapshot {
  const title = deriveNodeTitleFromContent(content);
  return {
    anchorLink: null,
    content,
    createdAt: timestamp,
    hideTitleHeading: false,
    id: nodeId ?? `node-${createCompanionUuid()}`,
    isTitleManual: false,
    kind: 'topic',
    openingText: resolveNodeOpeningText(content, title),
    parentNodeId,
    reading: null,
    reveal: null,
    review: null,
    title,
    updatedAt: timestamp
  };
}

async function buildCaptureTextDraft(args: PersistCompanionCapturedTextArgs): Promise<CaptureTextDraft> {
  if (!args.text.trim()) throw new CompanionCaptureTextError('empty');
  const content = args.preserveBoundaryWhitespace ? args.text : args.text.trim();
  if (!args.snapshot) throw new CompanionCaptureTextError('inbox-unavailable');
  const parentNodeId = args.parentNodeId ?? INBOX_NODE_ID;
  const node = createCaptureNode(content, args.now ?? new Date().toISOString(), args.nodeId, parentNodeId);
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId, args.versionId);
  if (args.nodeId && args.versionId && isAvailableNativeCompanionRuntime()) {
    await persistCompanionShareDelivery(nodeVersion, Boolean(args.snapshot.nodesById[INBOX_NODE_ID])
      && !args.snapshot.trashedNodeIds.includes(INBOX_NODE_ID));
    return { persisted: true, node, nodeVersion, snapshot: args.snapshot };
  }
  if (!canCreateTopicInside(args.snapshot.nodesById[parentNodeId]) || args.snapshot.trashedNodeIds.includes(parentNodeId)) {
    throw new CompanionCaptureTextError(parentNodeId === INBOX_NODE_ID ? 'inbox-unavailable' : 'target-unavailable');
  }
  let existingNode = args.nodeId ? args.snapshot.nodesById[args.nodeId] : null;
  if (existingNode && isAvailableNativeCompanionRuntime()) {
    const currentNode = await loadCompanionWorkspaceNode(existingNode.id);
    if (!currentNode) throw new Error('share_delivery_source_unavailable');
    existingNode = currentNode;
  }
  if (existingNode) {
    if (existingNode.content !== content || existingNode.parentNodeId !== parentNodeId) {
      throw new Error('share_delivery_collision');
    }
    return { node: existingNode, nodeVersion: await toCompanionNativeNodeVersion(
      existingNode, args.deviceId, args.versionId
    ), snapshot: args.snapshot };
  }
  const versionedNode = { ...node, currentVersionId: nodeVersion.version_id };
  return {
    node: versionedNode,
    nodeVersion,
    snapshot: {
      ...args.snapshot,
      nodeOrder: [...args.snapshot.nodeOrder, versionedNode.id],
      nodesById: { ...args.snapshot.nodesById, [versionedNode.id]: versionedNode }
    }
  };
}

export async function persistCompanionCapturedText(args: PersistCompanionCapturedTextArgs) {
  const draft = await buildCaptureTextDraft(args);
  if (!draft.persisted) {
    if (isAvailableNativeCompanionRuntime()) await runCompanionHistoryMutation(async db => {
      await assertCaptureParentAvailable(db, draft.node.parentNodeId!);
      return commitCompanionNodeHistoryWithDb(db, [draft.nodeVersion], 'Create topic', 'local_mutation', [draft.node.id]);
    });
    else await applyCompanionLocalNodeVersions([draft.nodeVersion]);
  }
  return {
    nodeId: draft.node.id,
    snapshot: draft.snapshot
  };
}

export function getCompanionCaptureTextErrorCode(error: unknown): CompanionCaptureTextErrorCode | null {
  const visited = new Set<unknown>();
  while (error && typeof error === 'object' && !visited.has(error)) {
    if (error instanceof CompanionCaptureTextError) return error.code;
    visited.add(error);
    error = 'cause' in error ? error.cause : null;
  }
  return null;
}

async function assertCaptureParentAvailable(db: DbPort, parentNodeId: string) {
  const visited = new Set<string>();
  let nodeId: string | null = parentNodeId;
  while (nodeId) {
    const node = await loadCompanionWorkspaceNodeFromDb(db, nodeId);
    if (!node || node.deletedAt || visited.has(nodeId)
      || (nodeId !== HOME_NODE_ID && !canCreateTopicInside(node))
      || (nodeId === parentNodeId && nodeId === HOME_NODE_ID)) {
      throw new CompanionCaptureTextError('target-unavailable');
    }
    visited.add(nodeId);
    nodeId = node.parentNodeId;
  }
}
