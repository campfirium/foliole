import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../features/nodes/model/nodeTypes';

import { resolveNodeContentState, resolveNodeRevealState } from './workspaceRendererBoundaryState';

export interface WorkspaceNodeDocument {
  content: string;
  hideTitleHeading: boolean;
  imageRegions?: Node['imageRegions'];
  kind: NodeKind;
  reveal: string | null;
  virtualFilter?: VirtualNodeFilter | null;
}

type WorkspaceDocumentStateNode = Pick<WorkspaceNodeDocument, 'content' | 'reveal'> & { hasContent?: boolean; hasReveal?: boolean };

export function isNodeDocumentLoaded(node: WorkspaceDocumentStateNode | null | undefined) {
  if (!node) {
    return false;
  }
  const contentState = resolveNodeContentState(node);
  const revealState = resolveNodeRevealState(node);
  const contentLoaded =
    typeof contentState === 'boolean'
      ? !contentState || node.content.length > 0
      : node.content.length > 0;
  const revealLoaded = typeof revealState === 'boolean' ? !revealState || node.reveal !== null : true;
  return contentLoaded && revealLoaded;
}

export function mergeWorkspaceNodeDocument<T extends object>(node: T, document: WorkspaceNodeDocument): T & WorkspaceDocumentStateNode {
  return {
    ...node,
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
