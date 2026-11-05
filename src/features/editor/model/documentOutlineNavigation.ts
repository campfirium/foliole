import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { selectCanonicalVisibleNodeIds } from '../../../shared/workspaceCanonicalSelectors';
import { projectNodeListLabel } from '../../nodes/model/nodeListLabelProjection';
import type { EditorTextAnchorDecoration, EditorSelection } from '../adapters/EditorAdapter';

import { collectMarkdownHeadingRanges } from './markdownHeadingProjection';

export interface DocumentPositionEntry {
  id: string;
  text: string;
  kind: 'topic' | 'item' | 'folder';
  action: 'position' | 'card' | 'container';
  selection?: EditorSelection;
  childIds: string[];
}

export interface DocumentOutlineSection {
  id: string;
  text: string;
  level: number;
  kind: 'heading' | 'preface' | 'body' | 'unplaced';
  selection?: EditorSelection;
  entryIds: string[];
}

export interface DocumentOutlineNavigation {
  sections: DocumentOutlineSection[];
  entries: Record<string, DocumentPositionEntry>;
}

function firstRanges(decorations: readonly EditorTextAnchorDecoration[]) {
  const ranges = new Map<string, EditorTextAnchorDecoration>();
  for (const range of decorations) {
    if (!range.nodeId || (ranges.get(range.nodeId)?.from ?? Infinity) <= range.from) continue;
    ranges.set(range.nodeId, range);
  }
  return ranges;
}

export function collectDocumentOutlineNavigation(args: {
  content: string;
  activeNodeId: string;
  snapshot: WorkspaceSnapshot | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}): DocumentOutlineNavigation {
  const headings = collectMarkdownHeadingRanges(args.content);
  const sections: DocumentOutlineSection[] = headings.map(heading => ({
    id: `heading:${heading.from}`, text: heading.text, kind: 'heading', level: heading.level,
    selection: { from: heading.contentFrom, to: heading.to - (args.content[heading.to - 1] === '\r' ? 1 : 0) }, entryIds: []
  }));
  const before: DocumentOutlineSection = { id: 'before', text: '…', kind: 'preface', level: 1, entryIds: [] };
  const unplaced: DocumentOutlineSection = { id: 'unplaced', text: '', kind: 'unplaced', level: 1, entryIds: [] };
  const body: DocumentOutlineSection = { id: 'body', text: '', kind: 'body', level: 0, entryIds: [] };
  const entries: DocumentOutlineNavigation['entries'] = {};
  const source = args.snapshot;
  const ranges = firstRanges(args.textAnchorDecorations);
  const visibleIds = source ? selectCanonicalVisibleNodeIds(source) : [];
  const directIds = source && visibleIds.includes(args.activeNodeId) ? visibleIds.filter(id =>
    source.nodesById[id]?.parentNodeId === args.activeNodeId) : [];
  directIds.sort((left, right) => (ranges.get(left)?.from ?? Infinity) - (ranges.get(right)?.from ?? Infinity));
  for (const id of directIds) {
    const node = source!.nodesById[id]!;
    if (node.kind === 'folder') continue;
    const range = ranges.get(id);
    const canLocate = node.kind === 'topic' && node.anchorLink?.kind === 'highlight' && range?.kind === 'highlight';
    entries[id] = { id, kind: node.kind, text: range
      ? projectNodeListLabel(args.content.slice(range.from, range.to)) : projectNodeListLabel(node.title || node.openingText || ''),
    action: canLocate ? 'position' : 'card', childIds: [],
    ...(range ? { selection: { from: range.from, to: range.to } } : {}) };
    const headingIndex = range ? headings.findLastIndex(heading => heading.from <= range.from) : -1;
    const section = !headings.length ? body : !range ? unplaced : headingIndex < 0 ? before : sections[headingIndex]!;
    section.entryIds.push(id);
  }
  return { entries, sections: headings.length
    ? [...(before.entryIds.length ? [before] : []), ...sections, ...(unplaced.entryIds.length ? [unplaced] : [])]
    : body.entryIds.length ? [body] : [] };
}
