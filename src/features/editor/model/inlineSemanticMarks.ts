export interface SemanticRange {
  from: number;
  to: number;
}

export interface SemanticMarkRange extends SemanticRange {
  className: 'cm-md-highlight' | 'cm-md-cloze' | 'cm-md-strong' | 'cm-md-cloze-placeholder';
}

export type SemanticReplaceRange = SemanticRange;

export interface SemanticMarkPlan {
  markRanges: SemanticMarkRange[];
  replaceRanges: SemanticReplaceRange[];
}

const INLINE_STRONG_PATTERN = /(\*\*|__)(.+?)\1/g;
const INLINE_HIGHLIGHT_PATTERN = /==(.+?)==/g;
const INLINE_CLOZE_PATTERN = /\{\{(.+?)\}\}/g;
const INLINE_CLOZE_PLACEHOLDER_PATTERN = /\[\.\.\.\]/g;

export function collectClozePlaceholderRanges(from: number, text: string): SemanticRange[] {
  const ranges: SemanticRange[] = [];
  let match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    ranges.push({ from: start, to: start + match[0].length });
    match = INLINE_CLOZE_PLACEHOLDER_PATTERN.exec(text);
  }
  INLINE_CLOZE_PLACEHOLDER_PATTERN.lastIndex = 0;
  return ranges;
}

export function collectStrongTextRanges(from: number, text: string, inCodeBlock: boolean): SemanticMarkRange[] {
  if (inCodeBlock) {
    return [];
  }

  const ranges: SemanticMarkRange[] = [];
  let match = INLINE_STRONG_PATTERN.exec(text);
  while (match) {
    const delimiterLength = match[1]?.length ?? 0;
    const contentFrom = from + match.index + delimiterLength;
    const contentTo = from + match.index + match[0].length - delimiterLength;
    ranges.push({ className: 'cm-md-strong', from: contentFrom, to: contentTo });
    match = INLINE_STRONG_PATTERN.exec(text);
  }
  INLINE_STRONG_PATTERN.lastIndex = 0;
  return ranges;
}

export function collectSemanticMarkPlan(from: number, text: string, inCodeBlock: boolean): SemanticMarkPlan {
  if (inCodeBlock) {
    return { markRanges: [], replaceRanges: [] };
  }

  const markRanges: SemanticMarkRange[] = [];
  const replaceRanges: SemanticReplaceRange[] = [];

  let highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  while (highlightMatch) {
    const start = from + highlightMatch.index;
    const matchText = highlightMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    markRanges.push({ className: 'cm-md-highlight', from: contentFrom, to: contentTo });
    replaceRanges.push({ from: start, to: start + 2 });
    replaceRanges.push({ from: contentTo, to: contentTo + 2 });
    highlightMatch = INLINE_HIGHLIGHT_PATTERN.exec(text);
  }
  INLINE_HIGHLIGHT_PATTERN.lastIndex = 0;

  let clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  while (clozeMatch) {
    const start = from + clozeMatch.index;
    const matchText = clozeMatch[0];
    const contentFrom = start + 2;
    const contentTo = start + matchText.length - 2;
    markRanges.push({ className: 'cm-md-cloze', from: contentFrom, to: contentTo });
    replaceRanges.push({ from: start, to: start + 2 });
    replaceRanges.push({ from: contentTo, to: contentTo + 2 });
    clozeMatch = INLINE_CLOZE_PATTERN.exec(text);
  }
  INLINE_CLOZE_PATTERN.lastIndex = 0;

  return { markRanges, replaceRanges };
}
