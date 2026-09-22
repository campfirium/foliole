export interface PdfDocumentTextPage {
  page: number;
  text: string;
}

export interface PdfDocumentTextMatchFragment {
  end: number;
  page: number;
  start: number;
}

export interface PdfDocumentTextMatch {
  fragments: PdfDocumentTextMatchFragment[];
  id: string;
  matchStart: number;
  page: number;
}

function projectSearchableText(value: string) {
  const indexMap: number[] = [];
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char || /\s/u.test(char)) continue;
    indexMap.push(index);
    text += char;
  }
  return { indexMap, text };
}

export function collectMappedTextRanges(text: string, query: string) {
  if (!text || !query) return [] as Array<{ end: number; start: number }>;
  const projectedText = projectSearchableText(text);
  const projectedQuery = projectSearchableText(query);
  if (!projectedText.text || !projectedQuery.text) return [] as Array<{ end: number; start: number }>;
  const ranges: Array<{ end: number; start: number }> = [];
  let cursor = 0;
  while (cursor < projectedText.text.length) {
    const next = projectedText.text.indexOf(projectedQuery.text, cursor);
    if (next < 0) break;
    const start = projectedText.indexMap[next];
    const end = projectedText.indexMap[next + projectedQuery.text.length - 1];
    if (typeof start === 'number' && typeof end === 'number' && end >= start) {
      ranges.push({ end: end + 1, start });
    }
    cursor = next + 1;
  }
  return ranges;
}

function collectPageMatches(page: PdfDocumentTextPage, query: string) {
  return collectMappedTextRanges(page.text.toLocaleLowerCase(), query).map((range, index): PdfDocumentTextMatch => ({
    fragments: [{ page: page.page, ...range }],
    id: `${page.page}:${range.start}:${index}`,
    matchStart: range.start,
    page: page.page
  }));
}

function collectBoundaryMatches(current: PdfDocumentTextPage, next: PdfDocumentTextPage, query: string) {
  if (query.length <= 1 || next.page !== current.page + 1 || !current.text || !next.text) return [];
  const tailLength = query.length - 1;
  const sliceStart = Math.max(0, current.text.length - tailLength);
  const currentTail = current.text.slice(sliceStart);
  const boundaryText = `${currentTail}${next.text.slice(0, tailLength)}`;
  return collectMappedTextRanges(boundaryText.toLocaleLowerCase(), query)
    .filter((range) => range.start < currentTail.length && range.end > currentTail.length)
    .map((range, index): PdfDocumentTextMatch => {
      const firstStart = sliceStart + range.start;
      return {
        fragments: [
          { end: Math.min(current.text.length, sliceStart + range.end), page: current.page, start: firstStart },
          { end: Math.max(0, range.end - currentTail.length), page: next.page, start: Math.max(0, range.start - currentTail.length) }
        ],
        id: `cross:${current.page}-${next.page}:${firstStart}:${index}`,
        matchStart: firstStart,
        page: current.page
      };
    });
}

export function searchPdfDocumentText(pages: PdfDocumentTextPage[], rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  const orderedPages = [...pages].sort((left, right) => left.page - right.page);
  const matches = orderedPages.flatMap((page) => collectPageMatches(page, query));
  for (let index = 0; index < orderedPages.length - 1; index += 1) {
    const current = orderedPages[index];
    const next = orderedPages[index + 1];
    if (current && next) matches.push(...collectBoundaryMatches(current, next, query));
  }
  return matches.sort((left, right) => left.page - right.page || left.matchStart - right.matchStart || left.id.localeCompare(right.id));
}
