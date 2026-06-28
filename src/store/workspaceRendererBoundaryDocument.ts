import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../features/nodes/model/nodeTypes';

import { shouldKeepLocalNodeContent } from './workspaceNodeContentVersionGuard';
import { resolveNodeContentState, resolveNodeRevealState } from './workspaceRendererBoundaryState';

export interface WorkspaceNodeDocument {
  bodyStatus?: WorkspaceNodeDocumentStatus;
  content: string;
  hideTitleHeading: boolean;
  imageRegions?: Node['imageRegions'];
  kind: NodeKind;
  reveal: string | null;
  updatedAt?: string;
  virtualFilter?: VirtualNodeFilter | null;
}

export type WorkspaceNodeDocumentStatus = 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';

type WorkspaceDocumentStateNode = Pick<WorkspaceNodeDocument, 'content' | 'reveal'> & {
  bodyStatus?: WorkspaceNodeDocumentStatus;
  hasContent?: boolean;
  hasReveal?: boolean;
};

function isWorkspaceNodeDocumentStatus(value: unknown): value is WorkspaceNodeDocumentStatus {
  return value === 'empty' || value === 'failed' || value === 'fetching' || value === 'missing' || value === 'ready';
}

function isRevealLoaded(node: WorkspaceDocumentStateNode) {
  const revealState = resolveNodeRevealState(node);
  return typeof revealState === 'boolean' ? !revealState || node.reveal !== null : true;
}

function resolveExplicitReadyStatus(node: WorkspaceDocumentStateNode) {
  const contentState = resolveNodeContentState(node);
  if (contentState === true && node.content.length === 0) {
    return 'fetching';
  }
  return isRevealLoaded(node) ? 'ready' : 'fetching';
}

export function getNodeDocumentStatus(node: WorkspaceDocumentStateNode | null | undefined): WorkspaceNodeDocumentStatus {
  if (!node) {
    return 'missing';
  }
  if (node.bodyStatus === 'ready') {
    return resolveExplicitReadyStatus(node);
  }
  if (isWorkspaceNodeDocumentStatus(node.bodyStatus)) {
    return node.bodyStatus;
  }
  const contentState = resolveNodeContentState(node);
  if (contentState === false) {
    return isRevealLoaded(node) ? 'empty' : 'fetching';
  }
  if (contentState === true) {
    return node.content.length > 0 && isRevealLoaded(node) ? 'ready' : 'fetching';
  }
  return node.content.length > 0 && isRevealLoaded(node) ? 'ready' : 'fetching';
}

export function isNodeDocumentLoaded(node: WorkspaceDocumentStateNode | null | undefined) {
  if (!node) {
    return false;
  }
  const status = getNodeDocumentStatus(node);
  return (status === 'empty' || status === 'ready') && isRevealLoaded(node);
}

function isEmptyBoundaryContentProjection(node: WorkspaceDocumentStateNode) {
  return resolveNodeContentState(node) === true && node.content.length === 0;
}

export function mergeWorkspaceNodeDocument<T extends object & { id?: string; updatedAt?: string }>(
  node: T,
  document: WorkspaceNodeDocument
): T & WorkspaceDocumentStateNode {
  const stateNode = node as T & WorkspaceDocumentStateNode;
  const keepLocalContent = !isEmptyBoundaryContentProjection(stateNode) && node.id && node.updatedAt
    ? shouldKeepLocalNodeContent({
      currentUpdatedAt: node.updatedAt,
      incomingUpdatedAt: document.updatedAt ?? node.updatedAt,
      nodeId: node.id
    })
    : false;
  const content = keepLocalContent ? stateNode.content : document.content;
  return {
    ...node,
    bodyStatus: document.bodyStatus ?? (content.trim().length > 0 ? 'ready' : 'empty'),
    content,
    hasContent: content.trim().length > 0,
    hideTitleHeading: document.hideTitleHeading,
    imageRegions: document.imageRegions ?? null,
    kind: document.kind,
    reveal: document.reveal,
    virtualFilter: document.virtualFilter ?? null,
    hasReveal: document.reveal !== null
  };
}
