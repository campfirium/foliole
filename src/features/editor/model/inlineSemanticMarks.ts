export interface SemanticRange {
  from: number;
  to: number;
}

export interface SemanticMarkRange extends SemanticRange {
  className: 'cm-md-strong' | 'cm-md-strikethrough';
}

const INLINE_STRONG_PATTERN = /(\*\*|__)(.+?)\1/g;
const INLINE_STRIKETHROUGH_PATTERN = /~~(.+?)~~/g;

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

export function collectStrikethroughTextRanges(from: number, text: string, inCodeBlock: boolean): SemanticMarkRange[] {
  if (inCodeBlock) {
    return [];
  }

  const ranges: SemanticMarkRange[] = [];
  let match = INLINE_STRIKETHROUGH_PATTERN.exec(text);
  while (match) {
    const contentFrom = from + match.index + 2;
    const contentTo = from + match.index + match[0].length - 2;
    ranges.push({ className: 'cm-md-strikethrough', from: contentFrom, to: contentTo });
    match = INLINE_STRIKETHROUGH_PATTERN.exec(text);
  }
  INLINE_STRIKETHROUGH_PATTERN.lastIndex = 0;
  return ranges;
}
