import {
  collectStrongTextRanges,
  collectStrikethroughTextRanges,
  type SemanticRange
} from './inlineSemanticMarks';

const INLINE_TOKEN_PATTERN = /(\*\*|__|~~)/g;
const SOURCE_HIGHLIGHT_PATTERN = /==(.+?)==/g;

export interface InlineCodeDelimiterRange extends SemanticRange {
  contentFrom: number;
  contentTo: number;
}

export interface InlineTextMarkRange extends SemanticRange {
  className: 'cm-md-source-highlight' | 'cm-md-strong' | 'cm-md-strikethrough' | 'cm-md-syntax-visible';
}

export interface InlineTextDecorationPlan {
  markRanges: InlineTextMarkRange[];
  replaceRanges: SemanticRange[];
}

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<SemanticRange>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) return true;
  }
  return false;
}

export function collectInlineTokenDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean,
  showSyntax: boolean,
  preservedRanges: ReadonlyArray<SemanticRange>
): InlineTextDecorationPlan {
  if (inCodeBlock) {
    return { markRanges: [], replaceRanges: [] };
  }

  const markRanges: InlineTextMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  let tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  while (tokenMatch) {
    const tokenFrom = from + tokenMatch.index;
    const tokenTo = tokenFrom + tokenMatch[0].length;
    if (!isWithinRanges(tokenFrom, tokenTo, preservedRanges)) {
      if (showSyntax) markRanges.push({ className: 'cm-md-syntax-visible', from: tokenFrom, to: tokenTo });
      else replaceRanges.push({ from: tokenFrom, to: tokenTo });
    }
    tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  }
  INLINE_TOKEN_PATTERN.lastIndex = 0;

  return { markRanges, replaceRanges };
}

export function collectInlineCodeSyntaxDecorationPlan(
  codeMatches: ReadonlyArray<InlineCodeDelimiterRange>
): InlineTextDecorationPlan {
  const markRanges: InlineTextMarkRange[] = [];

  for (const codeMatch of codeMatches) {
    markRanges.push({ className: 'cm-md-syntax-visible', from: codeMatch.from, to: codeMatch.contentFrom });
    markRanges.push({ className: 'cm-md-syntax-visible', from: codeMatch.contentTo, to: codeMatch.to });
  }

  return { markRanges, replaceRanges: [] };
}

export function collectStrongTextDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean
): InlineTextDecorationPlan {
  return {
    markRanges: collectStrongTextRanges(from, text, inCodeBlock),
    replaceRanges: []
  };
}

export function collectStrikethroughTextDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean
): InlineTextDecorationPlan {
  return {
    markRanges: collectStrikethroughTextRanges(from, text, inCodeBlock),
    replaceRanges: []
  };
}

export function collectSourceHighlightDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean,
  showSyntax: boolean,
  preservedRanges: ReadonlyArray<SemanticRange>
): InlineTextDecorationPlan {
  if (inCodeBlock) {
    return { markRanges: [], replaceRanges: [] };
  }

  const markRanges: InlineTextMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];
  let match = SOURCE_HIGHLIGHT_PATTERN.exec(text);

  while (match) {
    const start = from + match.index;
    const end = start + match[0].length;
    if (!isWithinRanges(start, end, preservedRanges)) {
      const contentFrom = start + 2;
      const contentTo = end - 2;
      markRanges.push({ className: 'cm-md-source-highlight', from: contentFrom, to: contentTo });
      if (showSyntax) {
        markRanges.push({ className: 'cm-md-syntax-visible', from: start, to: contentFrom });
        markRanges.push({ className: 'cm-md-syntax-visible', from: contentTo, to: end });
      } else {
        replaceRanges.push({ from: start, to: contentFrom });
        replaceRanges.push({ from: contentTo, to: end });
      }
    }
    match = SOURCE_HIGHLIGHT_PATTERN.exec(text);
  }

  SOURCE_HIGHLIGHT_PATTERN.lastIndex = 0;
  return { markRanges, replaceRanges };
}
