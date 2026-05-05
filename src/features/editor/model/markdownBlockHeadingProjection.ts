interface MarkdownSyntaxNode {
  firstChild: MarkdownSyntaxNode | null;
  from: number;
  name: string;
  nextSibling: MarkdownSyntaxNode | null;
  to: number;
}

export interface MarkdownHeadingPrefixRange {
  from: number;
  hiddenRanges?: Array<{ from: number; to: number }>;
  kind: 'heading';
  lineFrom: number;
  markerText: '';
  to: number;
}

function collectChildRanges(node: MarkdownSyntaxNode, name: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) ranges.push({ from: child.from, to: child.to });
  }
  return ranges;
}

function findChild(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

export function findLineStart(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function extendTrailingSpaces(source: string, position: number) {
  let cursor = position;
  while (cursor < source.length && (source[cursor] === ' ' || source[cursor] === '\t')) cursor += 1;
  return cursor;
}

function resolveLenientStrongATXLevel(node: MarkdownSyntaxNode, source: string) {
  const mark = findChild(node, 'HeaderMark');
  if (!mark) return null;
  const level = source.slice(mark.from, mark.to).length;
  return level >= 1 && level <= 6 ? level : null;
}

export function createMarkdownHeadingPrefixRange(
  node: MarkdownSyntaxNode,
  source: string,
  offset: number
): MarkdownHeadingPrefixRange | null {
  const headerMark = findChild(node, 'HeaderMark');
  if (!headerMark) return null;
  if (node.name === 'LenientStrongATXHeading') {
    const closingStrongMark = collectChildRanges(node, 'EmphasisMark').at(-1);
    return {
      from: offset + node.from,
      hiddenRanges: [
        { from: offset + node.from, to: offset + extendTrailingSpaces(source, headerMark.to) },
        ...(closingStrongMark ? [{ from: offset + closingStrongMark.from, to: offset + closingStrongMark.to }] : [])
      ],
      kind: 'heading',
      lineFrom: offset + findLineStart(source, node.from),
      markerText: '',
      to: offset + extendTrailingSpaces(source, headerMark.to)
    };
  }
  if (node.name.startsWith('ATXHeading')) {
    return {
      from: offset + node.from,
      kind: 'heading',
      lineFrom: offset + findLineStart(source, node.from),
      markerText: '',
      to: offset + extendTrailingSpaces(source, headerMark.to)
    };
  }
  if (node.name.startsWith('SetextHeading')) {
    const from = findLineStart(source, headerMark.from);
    return {
      from: offset + from,
      kind: 'heading',
      lineFrom: offset + from,
      markerText: '',
      to: offset + extendTrailingSpaces(source, headerMark.to)
    };
  }
  return null;
}

export function resolveMarkdownHeadingLineClass(node: MarkdownSyntaxNode, source: string) {
  const level = node.name === 'LenientStrongATXHeading'
    ? resolveLenientStrongATXLevel(node, source)
    : node.name === 'ATXHeading1' || node.name === 'SetextHeading1'
      ? 1
      : node.name === 'ATXHeading2' || node.name === 'SetextHeading2'
        ? 2
        : node.name === 'ATXHeading3'
          ? 3
          : null;
  return level === 1 ? 'cm-line-h1' : level === 2 ? 'cm-line-h2' : level === 3 ? 'cm-line-h3' : null;
}
