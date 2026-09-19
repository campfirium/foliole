import type { BlockContext, Line } from '@lezer/markdown';

interface MarkdownInputAccess {
  input?: {
    length: number;
    read(from: number, to: number): string;
  };
}

interface FrontmatterBlockBounds {
  afterTo: number;
  closingFrom: number;
  closingTo: number;
  contentFrom: number;
  contentTo: number;
  openingTo: number;
}

function isFrontmatterDelimiterText(value: string) {
  return value.trim() === '---';
}

function findNextLineEnd(source: string, from: number) {
  const newline = source.indexOf('\n', from);
  return newline < 0 ? source.length : newline;
}

function trimCarriageReturn(source: string, to: number) {
  return to > 0 && source[to - 1] === '\r' ? to - 1 : to;
}

function findFrontmatterBlockBounds(source: string): FrontmatterBlockBounds | null {
  const openingLineEnd = findNextLineEnd(source, 0);
  const openingTo = trimCarriageReturn(source, openingLineEnd);
  if (!isFrontmatterDelimiterText(source.slice(0, openingTo))) return null;

  let lineFrom = openingLineEnd < source.length ? openingLineEnd + 1 : source.length;
  while (lineFrom < source.length) {
    const lineEnd = findNextLineEnd(source, lineFrom);
    const lineTo = trimCarriageReturn(source, lineEnd);
    if (isFrontmatterDelimiterText(source.slice(lineFrom, lineTo))) {
      return {
        afterTo: lineEnd < source.length ? lineEnd + 1 : lineEnd,
        closingFrom: lineFrom,
        closingTo: lineTo,
        contentFrom: openingLineEnd < source.length ? openingLineEnd + 1 : openingLineEnd,
        contentTo: lineFrom > 0 && source[lineFrom - 1] === '\n' ? lineFrom - 1 : lineFrom,
        openingTo
      };
    }
    lineFrom = lineEnd < source.length ? lineEnd + 1 : source.length;
  }

  return null;
}

export function parseFrontmatterBlock(cx: BlockContext, line: Line) {
  if (cx.lineStart !== 0 || !isFrontmatterDelimiterText(line.text.slice(line.pos))) return false;
  const input = (cx as unknown as MarkdownInputAccess).input;
  if (!input) return false;
  const source = input.read(0, input.length);
  const bounds = findFrontmatterBlockBounds(source);
  if (!bounds) return false;

  const children = [cx.elt('FrontmatterDelimiter', 0, bounds.openingTo)];
  if (bounds.contentFrom < bounds.contentTo) {
    children.push(cx.elt('FrontmatterContent', bounds.contentFrom, bounds.contentTo));
  }
  children.push(cx.elt('FrontmatterDelimiter', bounds.closingFrom, bounds.closingTo));
  cx.addElement(cx.elt('Frontmatter', 0, bounds.closingTo, children));
  while (cx.lineStart < bounds.afterTo && cx.nextLine()) {
    // Move the block parser past the consumed frontmatter block.
  }
  return true;
}
