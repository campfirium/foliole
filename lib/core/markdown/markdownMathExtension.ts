import type { BlockContext, InlineContext, Line, MarkdownConfig } from '@lezer/markdown';

interface MarkdownInputAccess {
  input?: {
    length: number;
    read(from: number, to: number): string;
  };
}

export interface MarkdownMathRange {
  display: 'block' | 'inline';
  from: number;
  source: string;
  tex: string;
  texFrom: number;
  texTo: number;
  to: number;
}

interface MathBlockBounds {
  afterTo: number;
  closingFrom: number;
  closingTo: number;
  contentFrom: number;
  contentTo: number;
  from: number;
  openingTo: number;
  to: number;
}

const BACKSLASH = 92;
const DOLLAR = 36;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;

function isWhitespaceCode(value: number) {
  return value === 9 || value === 10 || value === 13 || value === 32;
}

function isAsciiDigitCode(value: number) {
  return value >= 48 && value <= 57;
}

function isEscaped(cx: InlineContext, pos: number) {
  let slashCount = 0;
  for (let cursor = pos - 1; cursor >= cx.offset && cx.char(cursor) === BACKSLASH; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isStandaloneBlockDelimiter(lineText: string, delimiter: string) {
  return lineText.trim() === delimiter;
}

function findNextLineEnd(source: string, from: number) {
  const newline = source.indexOf('\n', from);
  return newline < 0 ? source.length : newline;
}

function trimCarriageReturn(source: string, to: number) {
  return to > 0 && source[to - 1] === '\r' ? to - 1 : to;
}

function findMathBlockBounds(source: string, from: number, delimiter: '$$' | '\\['): MathBlockBounds | null {
  const closingDelimiter = delimiter === '$$' ? '$$' : '\\]';
  const openingLineEnd = findNextLineEnd(source, from);
  const openingTo = trimCarriageReturn(source, openingLineEnd);
  if (!isStandaloneBlockDelimiter(source.slice(from, openingTo), delimiter)) return null;

  let lineFrom = openingLineEnd < source.length ? openingLineEnd + 1 : source.length;
  while (lineFrom < source.length) {
    const lineEnd = findNextLineEnd(source, lineFrom);
    const lineTo = trimCarriageReturn(source, lineEnd);
    if (isStandaloneBlockDelimiter(source.slice(lineFrom, lineTo), closingDelimiter)) {
      const contentFrom = openingLineEnd < source.length ? openingLineEnd + 1 : openingLineEnd;
      const contentTo = lineFrom > 0 && source[lineFrom - 1] === '\n' ? lineFrom - 1 : lineFrom;
      return {
        afterTo: lineEnd < source.length ? lineEnd + 1 : lineEnd,
        closingFrom: lineFrom,
        closingTo: lineTo,
        contentFrom,
        contentTo,
        from,
        openingTo,
        to: lineTo
      };
    }
    lineFrom = lineEnd < source.length ? lineEnd + 1 : source.length;
  }

  return null;
}

function parseMathBlock(cx: BlockContext, line: Line) {
  const delimiter = resolveMathBlockOpeningDelimiter(line);
  if (!delimiter) return false;

  const input = (cx as unknown as MarkdownInputAccess).input;
  if (!input) return false;
  const source = input.read(0, input.length);
  const bounds = findMathBlockBounds(source, cx.lineStart + line.pos, delimiter);
  if (!bounds) return false;

  const children = [cx.elt('MathMark', bounds.from, bounds.openingTo)];
  if (bounds.contentFrom < bounds.contentTo) {
    children.push(cx.elt('MathContent', bounds.contentFrom, bounds.contentTo));
  }
  children.push(cx.elt('MathMark', bounds.closingFrom, bounds.closingTo));
  cx.addElement(cx.elt('MathBlock', bounds.from, bounds.to, children));
  while (cx.lineStart < bounds.afterTo && cx.nextLine()) {
    // Move the block parser past the consumed formula block.
  }
  return true;
}

function resolveMathBlockOpeningDelimiter(line: Line) {
  const lineText = line.text.slice(line.pos);
  if (isStandaloneBlockDelimiter(lineText, '$$')) return '$$';
  if (isStandaloneBlockDelimiter(lineText, '\\[')) return '\\[';
  return null;
}

function findInlineDollarClose(cx: InlineContext, from: number) {
  for (let cursor = from; cursor < cx.end; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (char !== DOLLAR || isEscaped(cx, cursor) || cx.char(cursor + 1) === DOLLAR) continue;
    if (isWhitespaceCode(cx.char(cursor - 1))) return -1;
    return cursor;
  }
  return -1;
}

function parseDollarInlineMath(cx: InlineContext, pos: number) {
  if (cx.char(pos + 1) === DOLLAR || isEscaped(cx, pos)) return -1;
  const after = cx.char(pos + 1);
  if (!Number.isFinite(after) || isWhitespaceCode(after) || isAsciiDigitCode(after)) return -1;
  const closeFrom = findInlineDollarClose(cx, pos + 2);
  if (closeFrom < 0) return -1;
  return cx.addElement(cx.elt('InlineMath', pos, closeFrom + 1, [
    cx.elt('MathMark', pos, pos + 1),
    cx.elt('MathContent', pos + 1, closeFrom),
    cx.elt('MathMark', closeFrom, closeFrom + 1)
  ]));
}

function findParenMathClose(cx: InlineContext, from: number) {
  for (let cursor = from; cursor < cx.end - 1; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (char === BACKSLASH && cx.char(cursor + 1) === RIGHT_PAREN && !isEscaped(cx, cursor)) return cursor;
  }
  return -1;
}

function parseParenInlineMath(cx: InlineContext, pos: number) {
  if (isEscaped(cx, pos) || cx.char(pos + 1) !== LEFT_PAREN) return -1;
  const closeFrom = findParenMathClose(cx, pos + 2);
  if (closeFrom < 0 || closeFrom === pos + 2) return -1;
  return cx.addElement(cx.elt('InlineMath', pos, closeFrom + 2, [
    cx.elt('MathMark', pos, pos + 2),
    cx.elt('MathContent', pos + 2, closeFrom),
    cx.elt('MathMark', closeFrom, closeFrom + 2)
  ]));
}

export const markdownMathExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'MathBlock', block: true },
    'InlineMath',
    'MathContent',
    'MathMark'
  ],
  parseBlock: [
    {
      name: 'MathBlock',
      parse(cx, line) {
        return parseMathBlock(cx, line);
      },
      endLeaf(_cx, line) {
        return resolveMathBlockOpeningDelimiter(line) !== null;
      },
      before: 'FencedCode'
    }
  ],
  parseInline: [
    {
      name: 'InlineMathDollar',
      parse(cx, next, pos) {
        return next === DOLLAR ? parseDollarInlineMath(cx, pos) : -1;
      },
      before: 'Emphasis'
    },
    {
      name: 'InlineMathParen',
      parse(cx, next, pos) {
        return next === BACKSLASH ? parseParenInlineMath(cx, pos) : -1;
      },
      before: 'Escape'
    }
  ]
};
