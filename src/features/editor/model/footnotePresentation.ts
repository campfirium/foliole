import type { FootnoteMatch } from './inlineMarkdownMatches';

export interface FootnotePresentation {
  ariaLabel: string;
  hasTooltip: boolean;
  label: string;
  note: string | null;
  status: 'resolved' | 'unresolved';
}

export function buildFootnotePresentation(footnote: FootnoteMatch): FootnotePresentation {
  const status = footnote.note ? 'resolved' : 'unresolved';

  return {
    ariaLabel: footnote.note ? `Footnote ${footnote.label}: ${footnote.note}` : `Footnote ${footnote.label}`,
    hasTooltip: Boolean(footnote.note),
    label: footnote.label,
    note: footnote.note,
    status
  };
}
