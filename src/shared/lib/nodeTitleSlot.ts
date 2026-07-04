export const NODE_TITLE_SLOT_PADDING_TOP = 'calc(var(--editor-space-xs) + var(--editor-space-md) + 2.485em + var(--editor-space-xs))';

export interface NodeTitleSlotNode {
  anchorLink?: unknown;
  id: string;
  kind: string;
  parentNodeId: string | null;
  specialKind?: string;
}

export function hasVisibleTitleHeading(content: string, _hideTitleHeading: boolean) {
  void _hideTitleHeading;
  const visibleStart = resolveVisibleContentStart(content);
  return visibleStart.startsWith('# ') || visibleStart.startsWith('**# ');
}

function resolveVisibleContentStart(content: string) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return content;
  }
  const normalized = content.replace(/\r\n?/g, '\n');
  const closingMatch = /^---$/m.exec(normalized.slice(4));
  if (!closingMatch?.index && closingMatch?.index !== 0) {
    return content;
  }
  return normalized.slice(4 + closingMatch.index + closingMatch[0].length).trimStart();
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
  return true;
}
