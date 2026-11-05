import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { collectVisibleNodeDescendants } from '../../nodes/model/nodeDescendants';
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
  const { entries: relatedEntries, directIds, ranges } = collectEntries(args);
  Object.assign(entries, relatedEntries);
  for (const id of directIds) {
    const range = ranges.get(id);
    const headingIndex = range ? headings.findLastIndex(heading => heading.from <= range.from) : -1;
    const section = !headings.length ? body : !range ? unplaced : headingIndex < 0 ? before : sections[headingIndex]!;
    section.entryIds.push(id);
  }
  return { entries, sections: headings.length
    ? [...(before.entryIds.length ? [before] : []), ...sections, ...(unplaced.entryIds.length ? [unplaced] : [])]
    : body.entryIds.length ? [body] : [] };
}

function collectEntries(args: Parameters<typeof collectDocumentOutlineNavigation>[0]) {
  const ranges = firstRanges(args.textAnchorDecorations);
  const entries: DocumentOutlineNavigation['entries'] = {};
  if (!args.snapshot) return { entries, directIds: [], ranges };
  const graph = collectVisibleNodeDescendants(args.snapshot, args.activeNodeId);
  const roots = new Set(graph.childrenById[args.activeNodeId] ?? []);
  for (const id of [...graph.nodeIds].reverse()) {
    const node = args.snapshot.nodesById[id]!;
    const childIds = graph.childrenById[id]!.filter(childId => Boolean(entries[childId]));
    if (node.kind === 'folder' && childIds.length === 0) continue;
    const range = roots.has(id) ? ranges.get(id) : undefined;
    const canLocate = node.kind === 'topic' && node.anchorLink?.kind === 'highlight' && range?.kind === 'highlight';
    entries[id] = { id, kind: node.kind, text: range
      ? projectNodeListLabel(args.content.slice(range.from, range.to)) : projectNodeListLabel(node.title || node.openingText || ''),
    action: node.kind === 'folder' ? 'container' : canLocate ? 'position' : 'card', childIds,
    ...(range ? { selection: { from: range.from, to: range.to } } : {}) };
  }
  const directIds = [...roots].filter(id => Boolean(entries[id]));
  directIds.sort((left, right) => (ranges.get(left)?.from ?? Infinity) - (ranges.get(right)?.from ?? Infinity));
  return { entries, directIds, ranges };
}

export function countDirectOutlineObjects(ids: readonly string[], entries: DocumentOutlineNavigation['entries']) {
  let count = 0;
  const pending = [...ids];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const entry = entries[id];
    if (!entry) continue;
    if (entry.kind === 'folder') pending.push(...entry.childIds);
    else count++;
  }
  return count;
}
