import {
  collectClozePlaceholderRanges,
  collectSemanticMarkPlan,
  collectStrongTextRanges,
  type SemanticRange
} from './inlineSemanticMarks';

const INLINE_TOKEN_PATTERN = /(\*\*|__|~~)/g;

export interface InlineCodeDelimiterRange extends SemanticRange {
  contentFrom: number;
  contentTo: number;
}

export interface InlineTextMarkRange extends SemanticRange {
  className:
    | 'cm-md-cloze'
    | 'cm-md-cloze-placeholder'
    | 'cm-md-highlight'
    | 'cm-md-strong'
    | 'cm-md-syntax-visible';
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

export function collectSemanticTextDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean
): InlineTextDecorationPlan {
  return collectSemanticMarkPlan(from, text, inCodeBlock);
}

export function collectClozePlaceholderDecorationPlan(from: number, text: string): InlineTextDecorationPlan {
  return {
    markRanges: collectClozePlaceholderRanges(from, text).map((range) => ({
      className: 'cm-md-cloze-placeholder',
      from: range.from,
      to: range.to
    })),
    replaceRanges: []
  };
}
