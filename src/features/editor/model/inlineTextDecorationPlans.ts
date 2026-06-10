import {
  collectEmphasisTextRanges,
  collectStrongTextRanges,
  collectStrikethroughTextRanges,
  type SemanticRange
} from './inlineSemanticMarks';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';

export interface InlineCodeDelimiterRange extends SemanticRange {
  contentFrom: number;
  contentTo: number;
}

interface InlineTextMarkRange extends SemanticRange {
  className: 'cm-md-emphasis' | 'cm-md-source-highlight' | 'cm-md-strong' | 'cm-md-strikethrough' | 'cm-md-syntax-visible';
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

  for (const inlineRange of collectMarkdownInlineRanges(text, from)) {
    if (inlineRange.kind !== 'emphasis' && inlineRange.kind !== 'strong' && inlineRange.kind !== 'strikethrough') {
      continue;
    }
    for (const syntaxRange of inlineRange.syntaxRanges) {
      if (!isWithinRanges(syntaxRange.from, syntaxRange.to, preservedRanges)) {
        if (showSyntax) {
          markRanges.push({ className: 'cm-md-syntax-visible', from: syntaxRange.from, to: syntaxRange.to });
        } else {
          replaceRanges.push({ from: syntaxRange.from, to: syntaxRange.to });
        }
      }
    }
  }

  return { markRanges, replaceRanges };
}

export function collectDanglingNoteAsteriskDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean
): InlineTextDecorationPlan {
  if (inCodeBlock) return { markRanges: [], replaceRanges: [] };
  const match = /^(\s*(?:>\s*)?)(\\?)\*注[：:]/u.exec(text);
  if (!match) return { markRanges: [], replaceRanges: [] };
  const asteriskFrom = from + (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
  return {
    markRanges: [],
    replaceRanges: [{ from: asteriskFrom, to: asteriskFrom + 1 }]
  };
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

export function collectEmphasisTextDecorationPlan(
  from: number,
  text: string,
  inCodeBlock: boolean
): InlineTextDecorationPlan {
  return {
    markRanges: collectEmphasisTextRanges(from, text, inCodeBlock),
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

  for (const inlineRange of collectMarkdownInlineRanges(text, from)) {
    if (inlineRange.kind !== 'sourceHighlight' || isWithinRanges(inlineRange.from, inlineRange.to, preservedRanges)) {
      continue;
    }
    markRanges.push({ className: 'cm-md-source-highlight', from: inlineRange.contentFrom, to: inlineRange.contentTo });
    for (const syntaxRange of inlineRange.syntaxRanges) {
      if (showSyntax) {
        markRanges.push({ className: 'cm-md-syntax-visible', from: syntaxRange.from, to: syntaxRange.to });
      } else {
        replaceRanges.push({ from: syntaxRange.from, to: syntaxRange.to });
      }
    }
  }

  return { markRanges, replaceRanges };
}
