import { isEpubGeneratedNodeId } from '../../../../lib/core/import/epubGeneratedNodeIdentity';
import { canCreateChildNodeKind } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

import type { Node } from './nodeTypes';
import { isHomeNode, isInboxNode, isVirtualRootNode, isVirtualNode } from './specialNodes';

type MoveRuleNode = Pick<Node, 'anchorLink' | 'id' | 'specialKind'> & { kind?: NodeKind };

export function canNodeBeMoved(node: MoveRuleNode | null | undefined) {
  if (!node || isHomeNode(node) || isInboxNode(node) || isVirtualRootNode(node)) {
    return false;
  }
  if (node.anchorLink || isEpubGeneratedNodeId(node.id)) {
    return false;
  }
  return true;
}

export function canNodeAcceptMovedNode(
  targetNode: MoveRuleNode | null | undefined,
  movedNode: MoveRuleNode | null | undefined
) {
  if (!targetNode || targetNode.anchorLink || !movedNode) {
    return false;
  }
  if (isHomeNode(targetNode)) {
    return false;
  }
  if (isVirtualRootNode(targetNode)) {
    return isVirtualNode(movedNode);
  }
  if (isVirtualNode(movedNode)) {
    return isVirtualNode(targetNode);
  }
  if (!movedNode.kind) {
    return false;
  }
  return canCreateChildNodeKind(targetNode.kind ?? null, movedNode.kind);
}
