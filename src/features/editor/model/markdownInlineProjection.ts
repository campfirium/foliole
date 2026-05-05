import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownInlineLinkRange, MarkdownInlineRange, MarkdownInlineToken } from './markdownInlineProjectionTypes';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

interface InlineProjectionCandidate {
  contentFrom: number;
  contentTo: number;
  href?: string;
  kind: Exclude<MarkdownInlineToken['kind'], 'text'>;
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

function createMarkedTextCandidate(
  node: MarkdownSyntaxNode,
  source: string,
  kind: 'strong' | 'strikethrough' | 'sourceHighlight' | 'inlineCode'
): InlineProjectionCandidate {
  const markName = resolveMarkNodeName(kind);
  const markRanges = collectChildRanges(node, new Set([markName]));
  const contentFrom = markRanges[0]?.to ?? node.from;
  const contentTo = markRanges[markRanges.length - 1]?.from ?? node.to;
  return {
    contentFrom,
    contentTo,
    from: node.from,
    kind,
    syntaxRanges: markRanges,
    text: sliceWithoutRanges(source, node.from, node.to, markRanges),
    to: node.to
  };
}

function resolveMarkNodeName(kind: 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong') {
  if (kind === 'inlineCode') return 'CodeMark';
  if (kind === 'sourceHighlight') return 'SourceHighlightMark';
  if (kind === 'strong') return 'EmphasisMark';
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

function visitInlineCandidates(args: {
  candidates: InlineProjectionCandidate[];
  node: MarkdownSyntaxNode;
  parentName: string | null;
  source: string;
}) {
  if (args.node.name === 'StrongEmphasis') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'strong'));
    return;
  }
  if (args.node.name === 'Strikethrough') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'strikethrough'));
    return;
  }
  if (args.node.name === 'SourceHighlight') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'sourceHighlight'));
    return;
  }
  if (args.node.name === 'InlineCode') {
    args.candidates.push(createMarkedTextCandidate(args.node, args.source, 'inlineCode'));
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

function visitLinkRanges(args: {
  links: MarkdownInlineLinkRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name === 'Link') {
    const marks = collectChildNodes(args.node, new Set(['LinkMark']));
    const url = collectChildNodes(args.node, new Set(['URL']))[0];
    const openingBracket = marks[0];
    const closingBracket = marks[1];
    if (openingBracket && closingBracket && url) {
      args.links.push({
        from: args.offset + args.node.from,
        hiddenRanges: [...marks, url]
          .map((range) => ({
            from: args.offset + range.from,
            to: args.offset + range.to
          }))
          .sort((left, right) => left.from - right.from),
        href: args.source.slice(url.from, url.to),
        labelFrom: args.offset + openingBracket.to,
        labelTo: args.offset + closingBracket.from,
        to: args.offset + args.node.to
      });
    }
    return;
  }
  if (args.node.name === 'Image') return;

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitLinkRanges({
      links: args.links,
      node: child,
      offset: args.offset,
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
  return candidates.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function collectMarkdownInlineRanges(text: string, offset = 0): MarkdownInlineRange[] {
  return collectInlineCandidates(text).map((candidate) => ({
    contentFrom: offset + candidate.contentFrom,
    contentTo: offset + candidate.contentTo,
    from: offset + candidate.from,
    href: candidate.href,
    kind: candidate.kind,
    syntaxRanges: candidate.syntaxRanges.map((range) => ({
      from: offset + range.from,
      to: offset + range.to
    })),
    text: candidate.text,
    to: offset + candidate.to
  }));
}

export function collectMarkdownInlineLinkRanges(text: string, offset = 0): MarkdownInlineLinkRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const links: MarkdownInlineLinkRange[] = [];
  visitLinkRanges({
    links,
    node: tree.topNode,
    offset,
    source: text
  });
  return links.sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function projectMarkdownInlineText(text: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;

  for (const candidate of collectInlineCandidates(text)) {
    if (candidate.from < cursor) continue;
    if (candidate.from > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, candidate.from) });
    if (candidate.kind === 'autolink') {
      tokens.push({
        href: candidate.href ?? candidate.text,
        kind: 'autolink',
        text: candidate.text
      });
    } else {
      tokens.push({
        kind: candidate.kind,
        text: candidate.text
      });
    }
    cursor = candidate.to;
  }

  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}
