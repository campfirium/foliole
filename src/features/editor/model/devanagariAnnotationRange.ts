import type { EditorSelection } from '../adapters/EditorAdapter';

const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });
const devanagari = /[\p{Script_Extensions=Devanagari}\u200c\u200d]/u;

function expandBoundary(content: string, offset: number, end: boolean) {
  if (offset <= 0 || offset >= content.length || !devanagari.test(content.slice(offset - 1, offset + 1))) return offset;
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = content.indexOf('\n', offset);
  const grapheme = segmenter.segment(content.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)).containing(offset - lineStart);
  if (!grapheme?.segment.includes('\u094d') || grapheme.index + lineStart === offset) return offset;
  return lineStart + grapheme.index + (end ? grapheme.segment.length : 0);
}

export function expandDevanagariAnnotationRange(content: string, range: EditorSelection): EditorSelection {
  if (range.from >= range.to) return range;
  return { from: expandBoundary(content, range.from, false), to: expandBoundary(content, range.to, true) };
}
