import { collectMarkdownInlineRanges } from './markdownInlineProjection';

export interface SemanticRange {
  from: number;
  to: number;
}

export interface SemanticMarkRange extends SemanticRange {
  className: 'cm-md-strong' | 'cm-md-strikethrough';
}

export function collectStrongTextRanges(from: number, text: string, inCodeBlock: boolean): SemanticMarkRange[] {
  if (inCodeBlock) {
    return [];
  }

  return collectMarkdownInlineRanges(text, from)
    .filter((range) => range.kind === 'strong')
    .map((range) => ({ className: 'cm-md-strong', from: range.contentFrom, to: range.contentTo }));
}

export function collectStrikethroughTextRanges(from: number, text: string, inCodeBlock: boolean): SemanticMarkRange[] {
  if (inCodeBlock) {
    return [];
  }

  return collectMarkdownInlineRanges(text, from)
    .filter((range) => range.kind === 'strikethrough')
    .map((range) => ({ className: 'cm-md-strikethrough', from: range.contentFrom, to: range.contentTo }));
}
