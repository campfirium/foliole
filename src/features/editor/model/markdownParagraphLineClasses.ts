import type { MarkdownBlockRange, MarkdownLineClassRange } from './markdownBlockProjection';

const PARAGRAPH_LINE_CLASS_PRIORITY = 0;

export function collectPlainParagraphLineClassRanges(
  source: string,
  offset: number,
  blockRanges: MarkdownBlockRange[],
  occupiedLineStarts: ReadonlySet<number>
): MarkdownLineClassRange[] {
  const thematicBreakStarts = new Set(blockRanges.map((range) => range.from));
  const ranges: MarkdownLineClassRange[] = [];
  let lineStart = 0;
  for (const line of source.split('\n')) {
    const from = offset + lineStart;
    if (line.trim() && !occupiedLineStarts.has(from) && !thematicBreakStarts.has(from)) {
      ranges.push({ className: 'cm-line-paragraph', from, priority: PARAGRAPH_LINE_CLASS_PRIORITY });
    }
    lineStart += line.length + 1;
  }
  return ranges;
}
