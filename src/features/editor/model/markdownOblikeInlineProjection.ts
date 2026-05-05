import { folioleMarkdownParser } from './folioleMarkdownParser';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownWikiLinkRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  labelFrom: number;
  labelTo: number;
  title: string;
  to: number;
}

function collectChildNode(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function collectChildRanges(node: MarkdownSyntaxNode, name: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) ranges.push({ from: child.from, to: child.to });
  }
  return ranges;
}

function createWikiLinkRange(node: MarkdownSyntaxNode, source: string, offset: number): MarkdownWikiLinkRange | null {
  const target = collectChildNode(node, 'WikiLinkTarget');
  if (!target) return null;
  const alias = collectChildNode(node, 'WikiLinkAlias');
  const labelBounds = resolveLabelBounds(node, alias);
  const labelFrom = offset + labelBounds.from;
  const labelTo = offset + labelBounds.to;
  const title = source.slice(target.from, target.to).trim();
  if (!title || labelFrom === labelTo) return null;
  return {
    from: offset + node.from,
    hiddenRanges: collectWikiHiddenRanges(node, labelFrom - offset, labelTo - offset, offset),
    labelFrom,
    labelTo,
    title,
    to: offset + node.to
  };
}

function resolveLabelBounds(node: MarkdownSyntaxNode, alias: MarkdownSyntaxNode | null) {
  if (alias) return { from: alias.from, to: alias.to };
  const marks = collectChildRanges(node, 'WikiLinkMark');
  return {
    from: marks[0]?.to ?? node.from,
    to: marks[marks.length - 1]?.from ?? node.to
  };
}

function collectWikiHiddenRanges(node: MarkdownSyntaxNode, labelFrom: number, labelTo: number, offset: number) {
  const ranges = collectChildRanges(node, 'WikiLinkMark');
  if (labelFrom > node.from) ranges.push({ from: node.from, to: labelFrom });
  if (labelTo < node.to) ranges.push({ from: labelTo, to: node.to });
  return mergeRanges(ranges).map((range) => ({ from: offset + range.from, to: offset + range.to }));
}

function mergeRanges(ranges: Array<{ from: number; to: number }>) {
  const merged: Array<{ from: number; to: number }> = [];
  for (const range of ranges.sort((left, right) => left.from - right.from)) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else if (range.from < range.to) merged.push({ ...range });
  }
  return merged;
}

function visitWikiLinks(args: {
  links: MarkdownWikiLinkRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name === 'WikiLink') {
    const range = createWikiLinkRange(args.node, args.source, args.offset);
    if (range) args.links.push(range);
    return;
  }
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitWikiLinks({ links: args.links, node: child, offset: args.offset, source: args.source });
  }
}

export function collectMarkdownWikiLinkRanges(text: string, offset = 0): MarkdownWikiLinkRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const links: MarkdownWikiLinkRange[] = [];
  visitWikiLinks({ links, node: tree.topNode, offset, source: text });
  return links.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}
