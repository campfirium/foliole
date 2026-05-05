import { canCreateChildNodeKind } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

import type { Node } from './nodeTypes';
import { isInboxNode } from './specialNodes';

type MoveRuleNode = Pick<Node, 'anchorLink' | 'specialKind'> & { kind?: NodeKind };

export function canNodeBeMoved(node: MoveRuleNode | null | undefined) {
  if (!node || isInboxNode(node)) {
    return false;
  }
  if (node.anchorLink) {
    return false;
  }
  return node.kind !== 'item';
}

export function canNodeAcceptMovedNode(
  targetNode: MoveRuleNode | null | undefined,
  movedNode: MoveRuleNode | null | undefined
) {
  if (!targetNode || targetNode.anchorLink || !movedNode) {
    return false;
  }
  if (!movedNode.kind) {
    return false;
  }
  return canCreateChildNodeKind(targetNode.kind ?? null, movedNode.kind);
}
