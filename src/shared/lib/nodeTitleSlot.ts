export const NODE_TITLE_SLOT_PADDING_TOP = 'calc(var(--editor-space-xs) + var(--editor-space-md) + 2.485em + var(--editor-space-xs))';

export interface NodeTitleSlotNode {
  anchorLink?: unknown;
  id: string;
  kind: string;
  parentNodeId: string | null;
  specialKind?: string;
}

export function hasVisibleTitleHeading(content: string, hideTitleHeading: boolean) {
  if (hideTitleHeading) {
    return false;
  }
  return content.startsWith('# ') || content.startsWith('**# ');
}

function isInboxLikeNode(node: NodeTitleSlotNode | undefined) {
  return node?.specialKind === 'inbox' || node?.id === 'special-inbox';
}

export function shouldReserveNodeTitleSlot<T extends NodeTitleSlotNode>(
  args: {
    content: string;
    hideTitleHeading: boolean;
    node: T | undefined;
    nodesById: Record<string, T>;
    isPrimaryTopic?: (node: T, nodesById: Record<string, T>) => boolean;
  }
) {
  if (!args.node || hasVisibleTitleHeading(args.content, args.hideTitleHeading)) {
    return false;
  }
  const parentNode = args.node.parentNodeId ? args.nodesById[args.node.parentNodeId] : undefined;
  const isPrimaryTopic = args.node.kind === 'topic' && (
    args.node.parentNodeId === null ||
    isInboxLikeNode(parentNode) ||
    Boolean(args.isPrimaryTopic?.(args.node, args.nodesById))
  );
  return Boolean(args.node.anchorLink) || isPrimaryTopic;
}
