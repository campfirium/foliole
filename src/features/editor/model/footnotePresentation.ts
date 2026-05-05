export interface FootnotePresentation {
  ariaLabel: string;
  hasTooltip: boolean;
  label: string;
  note: string | null;
  status: 'resolved' | 'unresolved';
}

export function buildFootnotePresentation(footnote: { label: string; note: string | null }): FootnotePresentation {
  const status = footnote.note ? 'resolved' : 'unresolved';

  return {
    ariaLabel: footnote.note ? `Footnote ${footnote.label}: ${footnote.note}` : `Footnote ${footnote.label}`,
    hasTooltip: Boolean(footnote.note),
    label: footnote.label,
    note: footnote.note,
    status
  };
}
