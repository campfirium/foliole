import { folioleMarkdownParser } from './folioleMarkdownParser';
import {
  createMarkdownHeadingPrefixRange,
  findLineStart,
  resolveMarkdownHeadingLineClass,
  type MarkdownHeadingPrefixRange
} from './markdownBlockHeadingProjection';
import type { MarkdownSyntaxTree } from './markdownLinkReferences';
import { collectPlainParagraphLineClassRanges } from './markdownParagraphLineClasses';
import {
  collectMarkdownHyphenThematicBreakLines,
  collectMarkdownThematicBreakNodes,
  type MarkdownThematicBreakRange
} from './markdownThematicBreakProjection';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export type MarkdownBlockRange = MarkdownThematicBreakRange;

export interface MarkdownLineClassRange {
  className: string;
  from: number;
  priority: number;
}

export type MarkdownPrefixKind = 'heading' | 'quote' | 'unordered-list' | 'ordered-list' | 'task-list';

export interface MarkdownPrefixRange {
  checked?: boolean;
  from: number;
  hiddenRanges?: MarkdownHeadingPrefixRange['hiddenRanges'];
  kind: MarkdownPrefixKind;
  lineFrom: number;
  markerText: string;
  to: number;
}

const LINE_CLASS_PRIORITIES = {
  heading: 5,
  quote: 4,
  taskList: 3,
  unorderedList: 2,
  orderedList: 1
} as const;

function setLineClass(
  lineClasses: Map<number, MarkdownLineClassRange>,
  from: number,
  className: string,
  priority: number
) {
  const current = lineClasses.get(from);
  if (current && current.priority >= priority) return;
  lineClasses.set(from, { className, from, priority });
}

function findChild(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function findDescendant(node: MarkdownSyntaxNode, name: string): MarkdownSyntaxNode | null {
  if (node.name === name) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return null;
}

function extendTrailingSpaces(source: string, position: number) {
  let cursor = position;
  while (cursor < source.length && (source[cursor] === ' ' || source[cursor] === '\t')) cursor += 1;
  return cursor;
}

function addPrefixRange(
  prefixes: MarkdownPrefixRange[],
  source: string,
  offset: number,
  range: Omit<MarkdownPrefixRange, 'lineFrom'>
) {
  prefixes.push({
    ...range,
    from: offset + range.from,
    lineFrom: offset + findLineStart(source, range.from),
    to: offset + range.to
  });
}

function visitPrefixNodes(args: {
  node: MarkdownSyntaxNode;
  offset: number;
  parentName: string | null;
  prefixes: MarkdownPrefixRange[];
  source: string;
}) {
  const headingPrefixRange = createMarkdownHeadingPrefixRange(args.node, args.source, args.offset);
  if (headingPrefixRange) args.prefixes.push(headingPrefixRange);

  if (args.node.name === 'QuoteMark') {
    addPrefixRange(args.prefixes, args.source, args.offset, {
      from: args.node.from,
      kind: 'quote',
      markerText: '',
      to: extendTrailingSpaces(args.source, args.node.to)
    });
  }

  if (args.node.name === 'ListItem') {
    collectListItemPrefix(args);
  }

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitPrefixNodes({
      node: child,
      offset: args.offset,
      parentName: args.node.name,
      prefixes: args.prefixes,
      source: args.source
    });
  }
}

function collectListItemPrefix(args: {
  node: MarkdownSyntaxNode;
  parentName: string | null;
  prefixes: MarkdownPrefixRange[];
  source: string;
  offset: number;
}) {
  const listMark = findChild(args.node, 'ListMark');
  if (!listMark) return;
  const taskMarker = findDescendant(args.node, 'TaskMarker');
  const paragraph = findChild(args.node, 'Paragraph');
  if (args.parentName === 'BulletList' && taskMarker) {
    addPrefixRange(args.prefixes, args.source, args.offset, {
      checked: args.source.slice(taskMarker.from, taskMarker.to).toLowerCase().includes('x'),
      from: args.node.from,
      kind: 'task-list',
      markerText: '',
      to: extendTrailingSpaces(args.source, taskMarker.to)
    });
  } else if (args.parentName === 'BulletList') {
    addPrefixRange(args.prefixes, args.source, args.offset, {
      from: args.node.from,
      kind: 'unordered-list',
      markerText: '• ',
      to: paragraph?.from ?? extendTrailingSpaces(args.source, listMark.to)
    });
  } else if (args.parentName === 'OrderedList') {
    addPrefixRange(args.prefixes, args.source, args.offset, {
      from: args.node.from,
      kind: 'ordered-list',
      markerText: `${args.source.slice(listMark.from, listMark.to)} `,
      to: paragraph?.from ?? extendTrailingSpaces(args.source, listMark.to)
    });
  }
}

function visitLineClassNodes(args: {
  lineClasses: Map<number, MarkdownLineClassRange>;
  node: MarkdownSyntaxNode;
  offset: number;
  parentName: string | null;
  source: string;
}) {
  const from = args.offset + (args.node.name === 'LenientStrongATXHeading' ? findLineStart(args.source, args.node.from) : args.node.from);
  const headingLineClass = resolveMarkdownHeadingLineClass(args.node, args.source);
  if (headingLineClass) setLineClass(args.lineClasses, from, headingLineClass, LINE_CLASS_PRIORITIES.heading);
  if (args.node.name === 'Blockquote') setLineClass(args.lineClasses, from, 'cm-line-quote', LINE_CLASS_PRIORITIES.quote);
  if (args.node.name === 'ListItem' && args.parentName === 'BulletList') {
    const className = findChild(args.node, 'Task') ? 'cm-line-list-unordered cm-line-task-list' : 'cm-line-list-unordered';
    setLineClass(args.lineClasses, from, className, findChild(args.node, 'Task') ? LINE_CLASS_PRIORITIES.taskList : LINE_CLASS_PRIORITIES.unorderedList);
  }
  if (args.node.name === 'ListItem' && args.parentName === 'OrderedList') {
    setLineClass(args.lineClasses, from, 'cm-line-list', LINE_CLASS_PRIORITIES.orderedList);
  }

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitLineClassNodes({
      lineClasses: args.lineClasses,
      node: child,
      offset: args.offset,
      parentName: args.node.name,
      source: args.source
    });
  }
}

export function collectMarkdownThematicBreakRanges(text: string, offset = 0): MarkdownBlockRange[] {
  return collectMarkdownThematicBreakRangesFromTree(folioleMarkdownParser.parse(text), text, offset);
}

export function collectMarkdownThematicBreakRangesFromTree(tree: MarkdownSyntaxTree, text: string, offset = 0): MarkdownBlockRange[] {
  const rangesByFrom = new Map<number, MarkdownBlockRange>();
  for (const range of collectMarkdownThematicBreakNodes(tree.topNode, offset)) {
    rangesByFrom.set(range.from, range);
  }
  for (const range of collectMarkdownHyphenThematicBreakLines(text, offset)) {
    rangesByFrom.set(range.from, range);
  }
  return Array.from(rangesByFrom.values()).sort((left, right) => left.from - right.from);
}

export function collectMarkdownLineClassRanges(text: string, offset = 0): MarkdownLineClassRange[] {
  return collectMarkdownLineClassRangesFromTree(folioleMarkdownParser.parse(text), text, offset);
}

export function collectMarkdownLineClassRangesFromTree(tree: MarkdownSyntaxTree, text: string, offset = 0): MarkdownLineClassRange[] {
  const lineClasses = new Map<number, MarkdownLineClassRange>();
  visitLineClassNodes({
    lineClasses,
    node: tree.topNode,
    offset,
    parentName: null,
    source: text
  });
  const thematicBreaks = collectMarkdownThematicBreakRangesFromTree(tree, text, offset);
  for (const range of collectPlainParagraphLineClassRanges(text, offset, thematicBreaks, new Set(lineClasses.keys()))) {
    setLineClass(lineClasses, range.from, range.className, range.priority);
  }
  return Array.from(lineClasses.values()).sort((left, right) => left.from - right.from);
}

export function collectMarkdownPrefixRanges(text: string, offset = 0): MarkdownPrefixRange[] {
  return collectMarkdownPrefixRangesFromTree(folioleMarkdownParser.parse(text), text, offset);
}

export function collectMarkdownPrefixRangesFromTree(tree: MarkdownSyntaxTree, text: string, offset = 0): MarkdownPrefixRange[] {
  const prefixes: MarkdownPrefixRange[] = [];
  visitPrefixNodes({
    node: tree.topNode,
    offset,
    parentName: null,
    prefixes,
    source: text
  });
  return prefixes.sort((left, right) => (left.lineFrom === right.lineFrom ? left.from - right.from : left.lineFrom - right.lineFrom));
}
