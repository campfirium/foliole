import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownHeadingRange {
  contentFrom: number;
  contentTo: number;
  from: number;
  level: number;
  text: string;
  to: number;
}

function collectChildRanges(node: MarkdownSyntaxNode, name: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) ranges.push({ from: child.from, to: child.to });
  }
  return ranges;
}

function resolveHeadingLevel(nodeName: string) {
  if (nodeName === 'SetextHeading1') return 1;
  if (nodeName === 'SetextHeading2') return 2;
  const suffix = nodeName.slice('ATXHeading'.length);
  const level = Number.parseInt(suffix, 10);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : null;
}

function normalizeHeadingText(source: string, from: number, to: number) {
  const inlineRanges = collectMarkdownInlineRanges(source.slice(from, to), from);
  const linkRanges = collectMarkdownInlineLinkRanges(source.slice(from, to), from);
  const hiddenRanges = [
    ...inlineRanges.flatMap((range) => range.syntaxRanges),
    ...linkRanges.flatMap((range) => range.hiddenRanges)
  ];
  return sliceWithoutRanges(source, from, to, hiddenRanges).trim().replace(/\s+/g, ' ');
}

function sliceWithoutRanges(source: string, from: number, to: number, ranges: ReadonlyArray<{ from: number; to: number }>) {
  const parts: string[] = [];
  let cursor = from;
  for (const range of [...ranges].sort((left, right) => left.from - right.from)) {
    if (range.from > cursor) parts.push(source.slice(cursor, range.from));
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < to) parts.push(source.slice(cursor, to));
  return parts.join('');
}

function createHeadingRange(node: MarkdownSyntaxNode, source: string, offset: number): MarkdownHeadingRange | null {
  const level = resolveHeadingLevel(node.name);
  if (!level) return null;
  const marks = collectChildRanges(node, 'HeaderMark');
  const isSetext = node.name.startsWith('SetextHeading');
  const contentFrom = isSetext ? node.from : skipInlineWhitespace(source, marks[0]?.to ?? node.from, node.to);
  const contentTo = isSetext ? trimSetextHeadingContentTo(source, marks[0]?.from ?? node.to) : marks.length > 1 ? marks[marks.length - 1]?.from ?? node.to : node.to;
  const text = normalizeHeadingText(source, contentFrom, contentTo);
  return text
    ? {
        contentFrom: offset + contentFrom,
        contentTo: offset + contentTo,
        from: offset + node.from,
        level,
        text,
        to: offset + node.to
      }
    : null;
}

function trimSetextHeadingContentTo(source: string, to: number) {
  let cursor = to;
  while (cursor > 0 && (source[cursor - 1] === '\n' || source[cursor - 1] === '\r' || source[cursor - 1] === ' ' || source[cursor - 1] === '\t')) {
    cursor -= 1;
  }
  return cursor;
}

function skipInlineWhitespace(source: string, from: number, to: number) {
  let cursor = from;
  while (cursor < to && (source[cursor] === ' ' || source[cursor] === '\t')) cursor += 1;
  return cursor;
}

function visitHeadingNodes(args: {
  headings: MarkdownHeadingRange[];
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name.startsWith('ATXHeading') || args.node.name.startsWith('SetextHeading')) {
    const heading = createHeadingRange(args.node, args.source, args.offset);
    if (heading) args.headings.push(heading);
    return;
  }
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitHeadingNodes({ headings: args.headings, node: child, offset: args.offset, source: args.source });
  }
}

export function collectMarkdownHeadingRanges(text: string, offset = 0): MarkdownHeadingRange[] {
  const tree = folioleMarkdownParser.parse(text);
  const headings: MarkdownHeadingRange[] = [];
  visitHeadingNodes({ headings, node: tree.topNode, offset, source: text });
  return headings.sort((left, right) => left.from - right.from);
}
