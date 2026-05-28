import type { Node } from '../../features/nodes/model/nodeTypes';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceRightPanelContext =
  | { kind: 'empty' }
  | { kind: 'external-document' }
  | { kind: 'topic'; node: Node }
  | { kind: 'unsupported-topic'; node: Node }
  | { kind: 'folder'; node: Node }
  | { kind: 'missing-node' }
  | { kind: 'other-node'; node: Node };

export function resolveWorkspaceRightPanelContext(args: {
  activeNodeId: string | null;
  hasExternalDocument: boolean;
  nodesById: Record<string, Node>;
}): WorkspaceRightPanelContext {
  if (args.hasExternalDocument) {
    return { kind: 'external-document' };
  }
  if (!args.activeNodeId) {
    return { kind: 'empty' };
  }
  const node = args.nodesById[args.activeNodeId];
  if (!node) {
    return { kind: 'missing-node' };
  }
  if (node.kind === 'topic') {
    if (node.anchorLink || node.specialKind) {
      return { kind: 'unsupported-topic', node };
    }
    return { kind: 'topic', node };
  }
  if (node.kind === 'folder') {
    return { kind: 'folder', node };
  }
  return { kind: 'other-node', node };
}

export function isWorkspaceRightPanelAvailable(
  panelId: WorkspaceRightPanelId,
  context: WorkspaceRightPanelContext
) {
  if (panelId === 'performance') {
    return true;
  }
  if (context.kind === 'external-document') {
    return panelId === 'outline';
  }
  if (panelId === 'review-queue') {
    return true;
  }
  if (context.kind === 'unsupported-topic') return panelId !== 'highlights';
  return context.kind === 'topic';
}
