import type { BlockContext, InlineContext, Line, MarkdownConfig } from '@lezer/markdown';

const MAX_LENIENT_STRONG_CONTENT_LENGTH = 1200;
const MAX_LENIENT_EMPHASIS_CONTENT_LENGTH = 80;

function isWhitespaceCode(value: number) {
  return value === 9 || value === 10 || value === 13 || value === 32;
}

function isLenientStrongClosing(cx: InlineContext, closeFrom: number) {
  const after = cx.char(closeFrom + 2);
  if (isTrailingSpaceStrongClosing(cx, closeFrom)) return true;
  if (!isValidCode(after) || after === 42 || isWhitespaceCode(after)) return false;
  return isPunctuationCode(resolveStrongClosingContentCode(cx, closeFrom));
}

function isLenientStrongOpening(cx: InlineContext, openFrom: number, closeFrom: number) {
  if (openFrom < cx.offset || closeFrom - openFrom <= 2) return false;
  if (cx.char(openFrom) !== 42 || cx.char(openFrom + 1) !== 42) return false;
  if (cx.char(openFrom - 1) === 42 || cx.char(openFrom - 1) === 92) return false;
  return !isWhitespaceCode(cx.char(openFrom + 2));
}

function isLenientEmphasisClosing(cx: InlineContext, closeFrom: number) {
  if (cx.char(closeFrom - 1) === 42 || cx.char(closeFrom + 1) === 42) return false;
  const after = cx.char(closeFrom + 1);
  if (!isValidCode(after) || isWhitespaceCode(after)) return false;
  return isPunctuationCode(cx.char(closeFrom - 1));
}

function isLenientEmphasisOpening(cx: InlineContext, openFrom: number, closeFrom: number) {
  if (openFrom < cx.offset || closeFrom - openFrom <= 1) return false;
  if (cx.char(openFrom) !== 42) return false;
  if (cx.char(openFrom - 1) === 42 || cx.char(openFrom - 1) === 92 || cx.char(openFrom + 1) === 42) return false;
  const after = cx.char(openFrom + 1);
  return !isWhitespaceCode(after) && isPunctuationCode(after);
}

function isTrailingSpaceStrongClosing(cx: InlineContext, closeFrom: number) {
  if (!isWhitespaceCode(cx.char(closeFrom - 1))) return false;
  const beforeContent = findPreviousNonWhitespace(cx, closeFrom - 1);
  if (beforeContent < cx.offset) return false;
  return isOnlyWhitespaceUntilLineEnd(cx, closeFrom + 2);
}

function findPreviousNonWhitespace(cx: InlineContext, from: number) {
  for (let cursor = from - 1; cursor >= cx.offset; cursor -= 1) {
    if (!isWhitespaceCode(cx.char(cursor))) return cursor;
  }
  return -1;
}

function resolveStrongClosingContentCode(cx: InlineContext, closeFrom: number) {
  if (!isWhitespaceCode(cx.char(closeFrom - 1))) return cx.char(closeFrom - 1);
  const previousContent = findPreviousNonWhitespace(cx, closeFrom);
  return previousContent < cx.offset ? -1 : cx.char(previousContent);
}

function isOnlyWhitespaceUntilLineEnd(cx: InlineContext, from: number) {
  for (let cursor = from; ; cursor += 1) {
    const char = cx.char(cursor);
    if (!isValidCode(char) || char === 10 || char === 13) return true;
    if (!isWhitespaceCode(char)) return false;
  }
}

function isPunctuationCode(value: number) {
  if (!isValidCode(value)) return false;
  return /\p{P}/u.test(String.fromCodePoint(value));
}

function isValidCode(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function parseLenientStrongEmphasis(cx: InlineContext, pos: number) {
  if (cx.char(pos + 1) !== 42) return -1;
  if (!isLenientStrongClosing(cx, pos)) return -1;
  const searchFrom = Math.max(cx.offset, pos - MAX_LENIENT_STRONG_CONTENT_LENGTH - 2);

  for (let cursor = pos - 2; cursor >= searchFrom; cursor -= 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (!isLenientStrongOpening(cx, cursor, pos)) continue;
    return addLenientInlineElement(cx, 'LenientStrongEmphasis', cursor, cursor + 2, pos, pos + 2);
  }

  return -1;
}

function addLenientInlineElement(
  cx: InlineContext,
  name: string,
  openFrom: number,
  openTo: number,
  closeFrom: number,
  closeTo: number
) {
  return cx.addElement(cx.elt(name, openFrom, closeTo, [
    cx.elt('EmphasisMark', openFrom, openTo),
    cx.elt('EmphasisMark', closeFrom, closeTo)
  ]));
}

function parseLenientPunctuationEmphasis(cx: InlineContext, pos: number) {
  if (!isLenientEmphasisClosing(cx, pos)) return -1;
  const searchFrom = Math.max(cx.offset, pos - MAX_LENIENT_EMPHASIS_CONTENT_LENGTH - 1);

  for (let cursor = pos - 1; cursor >= searchFrom; cursor -= 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (!isLenientEmphasisOpening(cx, cursor, pos)) continue;
    return addLenientInlineElement(cx, 'LenientPunctuationEmphasis', cursor, cursor + 1, pos, pos + 1);
  }

  return -1;
}

function parseLenientStrongATXHeading(cx: BlockContext, line: Line) {
  if (!isLenientStrongATXHeadingLine(line)) return false;
  const text = line.text.slice(line.pos).trimEnd();
  const inner = text.slice(2, -2);
  const match = /^(#{1,6})([ \t]+)(\S.*)$/.exec(inner);
  if (!match) return false;

  return addLenientStrongATXHeading(cx, line, text, match);
}

function isLenientStrongATXHeadingLine(line: Line) {
  const text = line.text.slice(line.pos).trimEnd();
  if (!text.startsWith('**') || !text.endsWith('**')) return false;
  const inner = text.slice(2, -2);
  return /^(#{1,6})([ \t]+)(\S.*)$/.test(inner);
}

function addLenientStrongATXHeading(cx: BlockContext, line: Line, text: string, match: RegExpExecArray) {
  const from = cx.lineStart + line.pos;
  const to = cx.lineStart + line.text.length;
  const headingMarkFrom = from + 2;
  const headingMarkTo = headingMarkFrom + (match[1]?.length ?? 0);
  const contentFrom = headingMarkTo + (match[2]?.length ?? 0);
  const closingStrongFrom = from + text.length - 2;
  const inlineText = line.text.slice(contentFrom - cx.lineStart, closingStrongFrom - cx.lineStart);
  const children = [
    cx.elt('EmphasisMark', from, from + 2),
    cx.elt('HeaderMark', headingMarkFrom, headingMarkTo),
    ...cx.parser.parseInline(inlineText, contentFrom),
    cx.elt('EmphasisMark', closingStrongFrom, closingStrongFrom + 2)
  ];

  cx.nextLine();
  cx.addElement(cx.elt('LenientStrongATXHeading', from, to, children));
  return true;
}

export const markdownCompatibilityExtensions: MarkdownConfig[] = [
  {
    defineNodes: ['LenientPunctuationEmphasis', 'LenientStrongATXHeading', 'LenientStrongEmphasis'],
    parseBlock: [
      {
        name: 'LenientStrongATXHeading',
        parse(cx, line) {
          return parseLenientStrongATXHeading(cx, line);
        },
        endLeaf(_cx, line) {
          return isLenientStrongATXHeadingLine(line);
        },
        before: 'ATXHeading'
      }
    ],
    parseInline: [
      {
        name: 'LenientPunctuationEmphasis',
        parse(cx, next, pos) {
          return next === 42 ? parseLenientPunctuationEmphasis(cx, pos) : -1;
        },
        before: 'Emphasis'
      },
      {
        name: 'LenientStrongEmphasis',
        parse(cx, next, pos) {
          return next === 42 ? parseLenientStrongEmphasis(cx, pos) : -1;
        },
        before: 'Emphasis'
      }
    ]
  }
];
