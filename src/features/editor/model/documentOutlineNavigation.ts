import type { Node } from '../../nodes/model/nodeTypes';
import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

import { extractDocumentOutline } from './documentOutline';

export type DocumentOutlineTab = 'outline' | 'topic' | 'item';
export const DOCUMENT_OUTLINE_TABS = ['outline', 'topic', 'item'] as const;

export interface DocumentPositionEntry {
  from: number;
  to: number;
  text: string;
  level?: number;
  nodeId?: string;
}

export function collectDocumentOutlineNavigation(args: {
  content: string;
  nodesById: Readonly<Record<string, Pick<Node, 'kind'>>>;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}): Record<DocumentOutlineTab, DocumentPositionEntry[]> {
  const byNode = new Map<string, DocumentPositionEntry>();
  for (const decoration of args.textAnchorDecorations) {
    const { nodeId, from, to } = decoration;
    if (!nodeId || !['topic', 'item'].includes(args.nodesById[nodeId]?.kind ?? '')) continue;
    if (byNode.has(nodeId) && byNode.get(nodeId)!.from <= from) continue;
    byNode.set(nodeId, { from, to, nodeId, text: args.content.slice(from, to).replace(/\s+/g, ' ').trim() });
  }
  const entries = [...byNode.values()].sort((left, right) => left.from - right.from || left.to - right.to);
  return {
    outline: extractDocumentOutline(args.content),
    topic: entries.filter(entry => args.nodesById[entry.nodeId!]!.kind === 'topic'),
    item: entries.filter(entry => args.nodesById[entry.nodeId!]!.kind === 'item')
  };
}
