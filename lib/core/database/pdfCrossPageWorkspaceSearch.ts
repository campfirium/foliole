const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildCrossPagePdfExcerpt(currentText: string, nextText: string, matchStart: number, query: string, page: number, endPage: number) {
  const combinedText = normalizeWhitespace(`${currentText}${nextText}`);
  if (!combinedText) {
    return `Cross-page match (${page}-${endPage})`;
  }

  const safeMatchStart = matchStart >= 0 ? matchStart : combinedText.toLowerCase().indexOf(query);
  if (safeMatchStart < 0) {
    return `Cross-page match (${page}-${endPage}) · ${combinedText.slice(0, EXCERPT_LENGTH)}`;
  }

  const start = Math.max(0, safeMatchStart - EXCERPT_PADDING);
  const end = Math.min(combinedText.length, safeMatchStart + query.length + EXCERPT_PADDING);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < combinedText.length ? '...' : '';
  return `Cross-page match (${page}-${endPage}) · ${prefix}${combinedText.slice(start, end)}${suffix}`;
}
