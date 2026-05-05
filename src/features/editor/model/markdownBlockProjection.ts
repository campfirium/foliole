import { folioleMarkdownParser } from './folioleMarkdownParser';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownBlockRange {
  from: number;
  kind: 'thematicBreak';
  to: number;
}

export interface MarkdownLineClassRange {
  className: string;
  from: number;
  priority: number;
}

export type MarkdownPrefixKind = 'heading' | 'quote' | 'unordered-list' | 'ordered-list' | 'task-list';

export interface MarkdownPrefixRange {
  checked?: boolean;
  from: number;
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

function findLineStart(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
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

function visitThematicBreakNodes(args: {
  blocks: MarkdownBlockRange[];
  node: MarkdownSyntaxNode;
  offset: number;
}) {
  if (args.node.name === 'HorizontalRule') {
    args.blocks.push({
      from: args.offset + args.node.from,
      kind: 'thematicBreak',
      to: args.offset + args.node.to
    });
    return;
  }

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitThematicBreakNodes({
      blocks: args.blocks,
      node: child,
      offset: args.offset
    });
  }
}

function visitPrefixNodes(args: {
  node: MarkdownSyntaxNode;
  offset: number;
  parentName: string | null;
  prefixes: MarkdownPrefixRange[];
  source: string;
}) {
  const headerMark = args.node.name.startsWith('ATXHeading') ? findChild(args.node, 'HeaderMark') : null;
  if (headerMark) {
    addPrefixRange(args.prefixes, args.source, args.offset, {
      from: args.node.from,
      kind: 'heading',
      markerText: '',
      to: extendTrailingSpaces(args.source, headerMark.to)
    });
  }

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
}) {
  const from = args.offset + args.node.from;
  if (args.node.name === 'ATXHeading1') setLineClass(args.lineClasses, from, 'cm-line-h1', LINE_CLASS_PRIORITIES.heading);
  if (args.node.name === 'ATXHeading2') setLineClass(args.lineClasses, from, 'cm-line-h2', LINE_CLASS_PRIORITIES.heading);
  if (args.node.name === 'ATXHeading3') setLineClass(args.lineClasses, from, 'cm-line-h3', LINE_CLASS_PRIORITIES.heading);
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
      parentName: args.node.name
    });
  }
}

export function collectMarkdownThematicBreakRanges(text: string, offset = 0): MarkdownBlockRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const blocks: MarkdownBlockRange[] = [];
  visitThematicBreakNodes({
    blocks,
    node: tree.topNode,
    offset
  });
  return blocks;
}

export function collectMarkdownLineClassRanges(text: string, offset = 0): MarkdownLineClassRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const lineClasses = new Map<number, MarkdownLineClassRange>();
  visitLineClassNodes({
    lineClasses,
    node: tree.topNode,
    offset,
    parentName: null
  });
  return Array.from(lineClasses.values()).sort((left, right) => left.from - right.from);
}

export function collectMarkdownPrefixRanges(text: string, offset = 0): MarkdownPrefixRange[] {
  const tree = folioleMarkdownParser.parse(text);
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
