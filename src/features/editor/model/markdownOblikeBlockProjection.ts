import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownSyntaxTree } from './markdownLinkReferences';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownCalloutPrefixRange {
  fold: 'collapsed' | 'expanded' | null;
  from: number;
  kind: string;
  lineFrom: number;
  markerText: string;
  titleFrom: number;
  titleTo: number;
  to: number;
}

function collectChildNode(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function findLineFrom(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function isBlockquotePrefix(source: string, lineFrom: number, markerFrom: number) {
  let hasQuote = false;
  for (let cursor = lineFrom; cursor < markerFrom; cursor += 1) {
    const code = source.charCodeAt(cursor);
    if (code === 62) hasQuote = true;
    else if (code !== 9 && code !== 32) return false;
  }
  return hasQuote;
}

function formatCalloutLabel(kind: string) {
  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1).toLowerCase()}`;
}

function resolveCalloutFold(node: MarkdownSyntaxNode, source: string): MarkdownCalloutPrefixRange['fold'] {
  const foldNode = collectChildNode(node, 'CalloutFold');
  if (!foldNode) return null;
  return source.slice(foldNode.from, foldNode.to) === '-' ? 'collapsed' : 'expanded';
}

function findLineEnd(source: string, position: number) {
  const newline = source.indexOf('\n', position);
  return newline < 0 ? source.length : newline;
}

function createCalloutPrefixRange(node: MarkdownSyntaxNode, source: string): MarkdownCalloutPrefixRange | null {
  const lineFrom = findLineFrom(source, node.from);
  if (!isBlockquotePrefix(source, lineFrom, node.from)) return null;
  const kindNode = collectChildNode(node, 'CalloutKind');
  const kind = kindNode ? source.slice(kindNode.from, kindNode.to).toLowerCase() : 'note';
  let to = node.to;
  while (to < source.length && source.charCodeAt(to) === 32) to += 1;
  return {
    fold: resolveCalloutFold(node, source),
    from: node.from,
    kind,
    lineFrom,
    markerText: formatCalloutLabel(kind),
    titleFrom: to,
    titleTo: findLineEnd(source, to),
    to
  };
}

function visitCalloutMarkers(args: {
  ranges: MarkdownCalloutPrefixRange[];
  node: MarkdownSyntaxNode;
  source: string;
}) {
  if (args.node.name === 'CalloutMarker') {
    const range = createCalloutPrefixRange(args.node, args.source);
    if (range) args.ranges.push(range);
    return;
  }
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitCalloutMarkers({ ranges: args.ranges, node: child, source: args.source });
  }
}

export function collectMarkdownCalloutPrefixRanges(text: string): MarkdownCalloutPrefixRange[] {
  return collectMarkdownCalloutPrefixRangesFromTree(folioleMarkdownParser.parse(text), text);
}

export function collectMarkdownCalloutPrefixRangesFromTree(
  tree: MarkdownSyntaxTree,
  text: string
): MarkdownCalloutPrefixRange[] {
  const ranges: MarkdownCalloutPrefixRange[] = [];
  visitCalloutMarkers({ ranges, node: tree.topNode, source: text });
  return ranges.sort((left, right) => left.from - right.from);
}
