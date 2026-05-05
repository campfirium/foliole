export type MarkdownInlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'strikethrough'; text: string }
  | { kind: 'sourceHighlight'; text: string }
  | { kind: 'inlineCode'; text: string }
  | { href: string; kind: 'autolink'; text: string }
  | { kind: 'footnote'; label: string; note: string | null }
  | { href: string; kind: 'link'; text: string }
  | { kind: 'wikiLink'; text: string; title: string };

export type MarkdownInlineRangeKind =
  | 'autolink'
  | 'emphasis'
  | 'inlineCode'
  | 'sourceHighlight'
  | 'strikethrough'
  | 'strong';

export interface MarkdownInlineRange {
  contentFrom: number;
  contentTo: number;
  href?: string;
  kind: MarkdownInlineRangeKind;
  syntaxRanges: Array<{ from: number; to: number }>;
  text: string;
  from: number;
  to: number;
}

export interface MarkdownInlineLinkRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  href: string;
  labelFrom: number;
  labelTo: number;
  to: number;
}
