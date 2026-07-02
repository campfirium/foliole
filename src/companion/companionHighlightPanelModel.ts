import type { EditorTextAnchorDecoration } from '@/features/editor/adapters/EditorAdapter';

export interface CompanionHighlightPanelItem {
  from: number;
  nodeId?: string;
  text: string;
  to: number;
}

function normalizeHighlightText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function createItem(content: string, decoration: EditorTextAnchorDecoration): CompanionHighlightPanelItem {
  return {
    from: decoration.from,
    ...(decoration.nodeId ? { nodeId: decoration.nodeId } : {}),
    text: normalizeHighlightText(content.slice(decoration.from, decoration.to)),
    to: decoration.to
  };
}

function getDecorationKey(decoration: EditorTextAnchorDecoration) {
  return decoration.nodeId ?? `range:${decoration.from}:${decoration.to}`;
}

export function buildCompanionHighlightPanelItems(args: {
  content: string;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}) {
  const byKey = new Map<string, CompanionHighlightPanelItem>();
  for (const decoration of args.textAnchorDecorations) {
    if (decoration.kind !== 'highlight') continue;
    const key = getDecorationKey(decoration);
    const existing = byKey.get(key);
    if (existing && existing.from <= decoration.from) continue;
    byKey.set(key, createItem(args.content, decoration));
  }
  return [...byKey.values()].sort((left, right) => left.from - right.from || left.to - right.to);
}
