import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import {
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

export type CompanionCaptureTextErrorCode = 'empty' | 'inbox-unavailable';

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
  preserveBoundaryWhitespace?: boolean;
  snapshot: WorkspaceSnapshot | null;
  text: string;
  versionId?: string;
}

interface CaptureTextDraft {
  node: WorkspaceNodeSnapshot;
  nodeVersion: NativeSyncNodeRecord;
  snapshot: WorkspaceSnapshot;
}

function createCaptureNode(content: string, timestamp: string, nodeId?: string): WorkspaceNodeSnapshot {
  return {
    anchorLink: null,
    content,
    createdAt: timestamp,
    hideTitleHeading: false,
    id: nodeId ?? `node-${createCompanionUuid()}`,
    isTitleManual: false,
    kind: 'topic',
    openingText: null,
    parentNodeId: INBOX_NODE_ID,
    reading: null,
    reveal: null,
    review: null,
    title: deriveNodeTitleFromContent(content),
    updatedAt: timestamp
  };
}

async function buildCaptureTextDraft(args: PersistCompanionCapturedTextArgs): Promise<CaptureTextDraft> {
  if (!args.text.trim()) throw new CompanionCaptureTextError('empty');
  const content = args.preserveBoundaryWhitespace ? args.text : args.text.trim();
  const inboxNode = args.snapshot?.nodesById[INBOX_NODE_ID];
  if (!args.snapshot || !inboxNode || args.snapshot.trashedNodeIds.includes(INBOX_NODE_ID)) {
    throw new CompanionCaptureTextError('inbox-unavailable');
  }
  let existingNode = args.nodeId ? args.snapshot.nodesById[args.nodeId] : null;
  if (existingNode && isAvailableNativeCompanionRuntime()) {
    const currentNode = await loadCompanionWorkspaceNode(existingNode.id);
    if (!currentNode) throw new Error('share_delivery_source_unavailable');
    existingNode = currentNode;
  }
  if (existingNode) {
    if (existingNode.content !== content || existingNode.parentNodeId !== INBOX_NODE_ID) {
      throw new Error('share_delivery_collision');
    }
    return { node: existingNode, nodeVersion: await toCompanionNativeNodeVersion(
      existingNode, args.deviceId, args.versionId
    ), snapshot: args.snapshot };
  }
  const node = createCaptureNode(content, args.now ?? new Date().toISOString(), args.nodeId);
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId, args.versionId);
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
  await applyCompanionLocalNodeVersions([draft.nodeVersion]);
  return {
    nodeId: draft.node.id,
    snapshot: draft.snapshot
  };
}

export function getCompanionCaptureTextErrorCode(error: unknown): CompanionCaptureTextErrorCode | null {
  return error instanceof CompanionCaptureTextError ? error.code : null;
}
