import { collectMarkdownHeadingRanges } from './markdownHeadingProjection';

export interface DocumentOutlineItem {
  from: number;
  level: number;
  text: string;
  to: number;
}

export function extractDocumentOutline(content: string): DocumentOutlineItem[] {
  return collectMarkdownHeadingRanges(content.replace(/\r\n/g, '\n')).map((heading) => ({
    from: heading.contentFrom,
    level: heading.level,
    text: heading.text,
    to: heading.to
  }));
}
