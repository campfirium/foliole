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

export interface MarkdownFootnoteRange {
  from: number;
  label: string;
  note: string | null;
  to: number;
}

export interface MarkdownEmbedRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  labelFrom: number;
  labelTo: number;
  target: string;
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

function createFootnoteRange(node: MarkdownSyntaxNode, source: string, offset: number): MarkdownFootnoteRange | null {
  const label = collectChildNode(node, 'FootnoteLabel');
  if (!label) return null;
  const rawLabel = source.slice(label.from, label.to).trim();
  if (!rawLabel) return null;
  const note = collectChildNode(node, 'FootnoteNote');
  return {
    from: offset + node.from,
    label: rawLabel,
    note: note ? unescapeFootnoteText(source.slice(note.from, note.to)) : null,
    to: offset + node.to
  };
}

function unescapeFootnoteText(note: string) {
  return note.replace(/\\([\\}])/g, '$1').trim() || null;
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
    hiddenRanges: collectHiddenRanges(node, 'WikiLinkMark', labelFrom - offset, labelTo - offset, offset),
    labelFrom,
    labelTo,
    title,
    to: offset + node.to
  };
}

function createEmbedRange(node: MarkdownSyntaxNode, source: string, offset: number): MarkdownEmbedRange | null {
  const target = collectChildNode(node, 'EmbedTarget');
  if (!target) return null;
  const alias = collectChildNode(node, 'EmbedAlias');
  const labelBounds = resolveEmbedLabelBounds(node, alias);
  const labelFrom = offset + labelBounds.from;
  const labelTo = offset + labelBounds.to;
  const rawTarget = source.slice(target.from, target.to).trim();
  if (!rawTarget || labelFrom === labelTo) return null;
  return {
    from: offset + node.from,
    hiddenRanges: collectHiddenRanges(node, 'EmbedMark', labelFrom - offset, labelTo - offset, offset),
    labelFrom,
    labelTo,
    target: rawTarget,
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

function resolveEmbedLabelBounds(node: MarkdownSyntaxNode, alias: MarkdownSyntaxNode | null) {
  if (alias) return { from: alias.from, to: alias.to };
  const marks = collectChildRanges(node, 'EmbedMark');
  return {
    from: marks[0]?.to ?? node.from,
    to: marks[marks.length - 1]?.from ?? node.to
  };
}

function collectHiddenRanges(
  node: MarkdownSyntaxNode,
  markName: string,
  labelFrom: number,
  labelTo: number,
  offset: number
) {
  const ranges = collectChildRanges(node, markName);
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

function visitFootnotes(args: {
  footnotes: MarkdownFootnoteRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name === 'Footnote') {
    const range = createFootnoteRange(args.node, args.source, args.offset);
    if (range) args.footnotes.push(range);
    return;
  }
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitFootnotes({ footnotes: args.footnotes, node: child, offset: args.offset, source: args.source });
  }
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

function visitEmbeds(args: {
  embeds: MarkdownEmbedRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name === 'Embed') {
    const range = createEmbedRange(args.node, args.source, args.offset);
    if (range) args.embeds.push(range);
    return;
  }
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitEmbeds({ embeds: args.embeds, node: child, offset: args.offset, source: args.source });
  }
}

export function collectMarkdownWikiLinkRanges(text: string, offset = 0): MarkdownWikiLinkRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const links: MarkdownWikiLinkRange[] = [];
  visitWikiLinks({ links, node: tree.topNode, offset, source: text });
  return links.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function collectMarkdownEmbedRanges(text: string, offset = 0): MarkdownEmbedRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const embeds: MarkdownEmbedRange[] = [];
  visitEmbeds({ embeds, node: tree.topNode, offset, source: text });
  return embeds.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function collectMarkdownFootnoteRanges(text: string, offset = 0): MarkdownFootnoteRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const footnotes: MarkdownFootnoteRange[] = [];
  visitFootnotes({ footnotes, node: tree.topNode, offset, source: text });
  return footnotes.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}
