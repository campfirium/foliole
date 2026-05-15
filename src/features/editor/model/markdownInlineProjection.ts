import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownInlineRange, MarkdownInlineRangeKind } from './markdownInlineProjectionTypes';
import { collectLenientTripleStarCandidates } from './markdownLenientTripleStarProjection';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

interface InlineProjectionCandidate {
  contentFrom: number;
  contentTo: number;
  href?: string;
  kind: MarkdownInlineRangeKind;
  syntaxRanges: Array<{ from: number; to: number }>;
  text: string;
  from: number;
  to: number;
}

const PUNCTUATION_PATTERN = /^[.,;:!?]+$/;

function normalizeAutolinkHref(text: string) {
  if (text.startsWith('www.')) return `https://${text}`;
  if (text.includes('@') && !text.includes('://')) return `mailto:${text}`;
  return text;
}

function collectChildRanges(node: MarkdownSyntaxNode, names: ReadonlySet<string>) {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) ranges.push({ from: child.from, to: child.to });
  }
  return ranges;
}

function collectChildNodes(node: MarkdownSyntaxNode, names: ReadonlySet<string>) {
  const nodes: MarkdownSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) nodes.push(child);
  }
  return nodes;
}

function sliceWithoutRanges(source: string, from: number, to: number, ranges: ReadonlyArray<{ from: number; to: number }>) {
  const parts: string[] = [];
  let cursor = from;
  for (const range of ranges) {
    if (range.from > cursor) parts.push(source.slice(cursor, range.from));
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < to) parts.push(source.slice(cursor, to));
  return parts.join('');
}

function resolveMarkCandidates(kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong') {
  if (kind === 'inlineCode') return ['`'];
  if (kind === 'sourceHighlight') return ['=='];
  if (kind === 'strikethrough') return ['~~'];
  if (kind === 'strong') return ['**', '__'];
  return ['*', '_'];
}

function normalizeMarkRange(
  source: string,
  range: { from: number; to: number },
  kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong'
) {
  if (range.from <= range.to) return range;

  for (const mark of resolveMarkCandidates(kind)) {
    const from = range.to - mark.length;
    if (from >= 0 && source.slice(from, range.to) === mark) {
      return { from, to: range.to };
    }
  }

  return range;
}

function createMarkedTextCandidate(
  node: MarkdownSyntaxNode,
  source: string,
  kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong'
): InlineProjectionCandidate {
  const markName = resolveMarkNodeName(kind);
  const markRanges = collectChildRanges(node, new Set([markName]))
    .map((range) => normalizeMarkRange(source, range, kind))
    .filter((range) => range.from <= range.to);
  const contentFrom = markRanges[0]?.to ?? node.from;
  const contentTo = markRanges[markRanges.length - 1]?.from ?? node.to;
  const from = Math.min(node.from, contentFrom, ...markRanges.map((range) => range.from));
  return {
    contentFrom,
    contentTo,
    from,
    kind,
    syntaxRanges: markRanges,
    text: sliceWithoutRanges(source, from, node.to, markRanges),
    to: node.to
  };
}

function resolveMarkNodeName(kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong') {
  if (kind === 'inlineCode') return 'CodeMark';
  if (kind === 'sourceHighlight') return 'SourceHighlightMark';
  if (kind === 'strong' || kind === 'emphasis') return 'EmphasisMark';
  return 'StrikethroughMark';
}

function createUrlCandidate(
  node: MarkdownSyntaxNode,
  source: string
): InlineProjectionCandidate | null {
  const rawText = source.slice(node.from, node.to);
  if (!rawText || PUNCTUATION_PATTERN.test(rawText)) return null;
  return {
    contentFrom: node.from,
    contentTo: node.to,
    from: node.from,
    href: normalizeAutolinkHref(rawText),
    kind: 'autolink',
    syntaxRanges: [],
    text: rawText,
    to: node.to
  };
}

function createAutolinkCandidate(node: MarkdownSyntaxNode, source: string): InlineProjectionCandidate | null {
  const url = collectChildNodes(node, new Set(['URL']))[0];
  if (!url) return null;
  const rawText = source.slice(url.from, url.to);
  if (!rawText || PUNCTUATION_PATTERN.test(rawText)) return null;
  return {
    contentFrom: url.from,
    contentTo: url.to,
    from: node.from,
    href: normalizeAutolinkHref(rawText),
    kind: 'autolink',
    syntaxRanges: collectChildRanges(node, new Set(['LinkMark'])),
    text: rawText,
    to: node.to
  };
}

function visitInlineCandidates(args: {
  candidates: InlineProjectionCandidate[];
  node: MarkdownSyntaxNode;
  parentName: string | null;
  source: string;
}) {
  if (args.node.name === 'StrongEmphasis' || args.node.name === 'LenientStrongEmphasis') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'strong'));
  }
  else if (args.node.name === 'Emphasis') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'emphasis'));
  }
  else if (args.node.name === 'Strikethrough') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'strikethrough'));
  }
  else if (args.node.name === 'SourceHighlight') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'sourceHighlight'));
  }
  else if (args.node.name === 'InlineCode') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'inlineCode'));
    return;
  }
  if (args.node.name === 'Autolink') {
    const candidate = createAutolinkCandidate(args.node, args.source);
    if (candidate) args.candidates.push(candidate);
    return;
  }
  if (args.node.name === 'URL' && args.parentName !== 'Link' && args.parentName !== 'Image') {
    const candidate = createUrlCandidate(args.node, args.source);
    if (candidate) args.candidates.push(candidate);
    return;
  }

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitInlineCandidates({
      candidates: args.candidates,
      node: child,
      parentName: args.node.name,
      source: args.source
    });
  }
}

function collectInlineCandidates(text: string) {
  const tree = folioleMarkdownParser.parse(text);
  const candidates: InlineProjectionCandidate[] = [];
  visitInlineCandidates({
    candidates,
    node: tree.topNode,
    parentName: null,
    source: text
  });
  candidates.push(...collectLenientTripleStarCandidates(text));
  return candidates.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function collectMarkdownInlineRanges(text: string, offset = 0): MarkdownInlineRange[] {
  return collectInlineCandidates(text).map((candidate) => ({
    contentFrom: offset + candidate.contentFrom,
    contentTo: offset + candidate.contentTo,
    from: offset + candidate.from,
    ...(candidate.href !== undefined ? { href: candidate.href } : {}),
    kind: candidate.kind,
    syntaxRanges: candidate.syntaxRanges.map((range) => ({
      from: offset + range.from,
      to: offset + range.to
    })),
    text: candidate.text,
    to: offset + candidate.to
  }));
}
