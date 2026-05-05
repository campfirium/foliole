import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import type { InlineCodeMatch, RangeBounds } from './liveMarkdownInlineDecorations';
import { addMark, addReplace } from './liveMarkdownPrimitives';

const INLINE_TOKEN_PATTERN = /(\*\*|__|~~)/g;
const INLINE_STRONG_PATTERN = /(\*\*|__)(.+?)\1/g;
const INLINE_HIGHLIGHT_PATTERN = /==(.+?)==/g;
const INLINE_CLOZE_PATTERN = /\{\{(.+?)\}\}/g;
const INLINE_CLOZE_PLACEHOLDER_PATTERN = /\[\.\.\.\]/g;

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) return true;
  }
  return false;
}

export function collectClozePlaceholderRanges(from: number, text: string): RangeBounds[] {
  const ranges: RangeBounds[] = [];
  let match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    ranges.push({ from: start, to: start + match[0].length });
    match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  }
  INLINE_CLOZE_PLACEHOLDER_PATTERN.lastIndex = 0;
  return ranges;
}

export function addInlineTokenDecorations(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  inCodeBlock: boolean,
  showSyntax: boolean,
  preservedRanges: ReadonlyArray<RangeBounds>
) {
  if (inCodeBlock) return;
  let tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  while (tokenMatch) {
    const tokenFrom = from + tokenMatch.index;
    const tokenTo = tokenFrom + tokenMatch[0].length;
    if (isWithinRanges(tokenFrom, tokenTo, preservedRanges)) {
      tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
      continue;
    }
    if (showSyntax) addMark(ranges, tokenFrom, tokenTo, 'cm-md-syntax-visible');
    else addReplace(ranges, tokenFrom, tokenTo);
    tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  }
  INLINE_TOKEN_PATTERN.lastIndex = 0;
}

export function addClozePlaceholderDecorations(
  ranges: Range<Decoration>[],
  placeholderRanges: ReadonlyArray<RangeBounds>
) {
  for (const range of placeholderRanges) addMark(ranges, range.from, range.to, 'cm-md-cloze-placeholder');
}

export function addStrongTextDecorations(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  inCodeBlock: boolean
) {
  if (inCodeBlock) return;
  let match = INLINE_STRONG_PATTERN.exec(text);
  while (match) {
    const delimiterLength = match[1]?.length ?? 0;
    const contentFrom = from + match.index + delimiterLength;
    const contentTo = from + match.index + match[0].length - delimiterLength;
    addMark(ranges, contentFrom, contentTo, 'cm-md-strong');
    match = INLINE_STRONG_PATTERN.exec(text);
  }
  INLINE_STRONG_PATTERN.lastIndex = 0;
}

export function addSemanticMarkDecorations(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  inCodeBlock: boolean
) {
  if (inCodeBlock) return;

  let highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  while (highlightMatch) {
    const start = from + highlightMatch.index;
    const matchText = highlightMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    addMark(ranges, contentFrom, contentTo, 'cm-md-highlight');
    addReplace(ranges, start, start + 2);
    addReplace(ranges, contentTo, contentTo + 2);
    highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  }
  INLINE_HIGHLIGHT_PATTERN.lastIndex = 0;

  let clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  while (clozeMatch) {
    const start = from + clozeMatch.index;
    const matchText = clozeMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    addMark(ranges, contentFrom, contentTo, 'cm-md-cloze');
    addReplace(ranges, start, start + 2);
    addReplace(ranges, contentTo, contentTo + 2);
    clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  }
  INLINE_CLOZE_PATTERN.lastIndex = 0;
}

export function addInlineCodeSyntaxDecorations(
  ranges: Range<Decoration>[],
  codeMatches: ReadonlyArray<InlineCodeMatch>
) {
  for (const codeMatch of codeMatches) {
    addMark(ranges, codeMatch.from, codeMatch.contentFrom, 'cm-md-syntax-visible');
    addMark(ranges, codeMatch.contentTo, codeMatch.to, 'cm-md-syntax-visible');
  }
}
