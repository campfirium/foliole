import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../features/nodes/model/nodeTypes';

import { resolveNodeContentState, resolveNodeRevealState } from './workspaceRendererBoundaryState';

export interface WorkspaceNodeDocument {
  bodyStatus?: WorkspaceNodeDocumentStatus;
  content: string;
  hideTitleHeading: boolean;
  imageRegions?: Node['imageRegions'];
  kind: NodeKind;
  reveal: string | null;
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

export function getNodeDocumentStatus(node: WorkspaceDocumentStateNode | null | undefined): WorkspaceNodeDocumentStatus {
  if (!node) {
    return 'missing';
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

export function mergeWorkspaceNodeDocument<T extends object>(node: T, document: WorkspaceNodeDocument): T & WorkspaceDocumentStateNode {
  return {
    ...node,
    bodyStatus: document.bodyStatus ?? (document.content.trim().length > 0 ? 'ready' : 'empty'),
    content: document.content,
    hasContent: document.content.trim().length > 0,
    hideTitleHeading: document.hideTitleHeading,
    imageRegions: document.imageRegions ?? null,
    kind: document.kind,
    reveal: document.reveal,
    virtualFilter: document.virtualFilter ?? null,
    hasReveal: document.reveal !== null
  };
}
