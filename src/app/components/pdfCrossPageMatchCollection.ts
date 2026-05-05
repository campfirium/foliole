import type { PdfPageTextEntry } from './pdfPageText';
import type { PdfSearchMatch } from './pdfSearchMatchCollection';
import { collectMappedQueryRanges, resolvePageBounds } from './pdfSearchMatchCollectionUtils';
import { resolveGeometryFromIndexedMapping, resolveGeometryFromRenderedSegments } from './pdfSearchMatchGeometry';
import { collectTextItemNodes, type TextSpanSegment } from './pdfSearchTextSegments';

interface PdfSearchablePage {
  indexedEntry: PdfPageTextEntry;
  page: number;
  renderedSegments: TextSpanSegment[];
  shell: HTMLDivElement;
  text: string;
}

function buildCrossPageMatchId(page: number, endPage: number, matchStart: number, index: number) {
  return `cross:${page}-${endPage}:${matchStart}:${index}`;
}

function resolveCrossPageFragmentGeometry(page: PdfSearchablePage, start: number, end: number) {
  if (end <= start) {
    return null;
  }
  const pageBounds = resolvePageBounds(page.shell);
  if (page.renderedSegments.length > 0) {
    return resolveGeometryFromRenderedSegments({
      matchStart: start,
      pageBounds,
      queryLength: end - start,
      segments: page.renderedSegments
    });
  }
  const itemNodes = collectTextItemNodes(pageBounds);
  if (itemNodes.length === 0 || page.indexedEntry.itemRanges.length === 0) {
    return null;
  }
  return resolveGeometryFromIndexedMapping({
    indexedItemRanges: page.indexedEntry.itemRanges,
    itemNodes,
    matchStart: start,
    pageBounds,
    queryLength: end - start
  });
}

export function collectCrossPageMatches(pages: PdfSearchablePage[], query: string): PdfSearchMatch[] {
  if (query.length <= 1 || pages.length <= 1) {
    return [];
  }

  const tailLength = query.length - 1;
  const matches: PdfSearchMatch[] = [];

  for (let index = 0; index < pages.length - 1; index += 1) {
    const current = pages[index];
    const next = pages[index + 1];
    if (!current || !next || next.page !== current.page + 1 || !current.text || !next.text) {
      continue;
    }

    const currentSliceStart = Math.max(0, current.text.length - tailLength);
    const currentTail = current.text.slice(currentSliceStart);
    const boundaryText = `${currentTail}${next.text.slice(0, tailLength)}`;
    const boundaryRanges = collectMappedQueryRanges(boundaryText.toLocaleLowerCase(), query).filter(
      (range) => range.start < currentTail.length && range.end > currentTail.length
    );

    boundaryRanges.forEach((range, rangeIndex) => {
      const firstStart = currentSliceStart + range.start;
      const firstEnd = Math.min(current.text.length, currentSliceStart + range.end);
      const secondStart = Math.max(0, range.start - currentTail.length);
      const secondEnd = Math.max(0, range.end - currentTail.length);
      const firstGeometry = resolveCrossPageFragmentGeometry(current, firstStart, firstEnd);
      const secondGeometry = resolveCrossPageFragmentGeometry(next, secondStart, secondEnd);
      matches.push({
        element: firstGeometry?.element ?? current.shell,
        fragments: [
          {
            element: firstGeometry?.element ?? current.shell,
            page: current.page,
            rects: firstGeometry?.rects ?? [],
            x: firstGeometry?.x ?? null,
            y: firstGeometry?.y ?? null
          },
          {
            element: secondGeometry?.element ?? next.shell,
            page: next.page,
            rects: secondGeometry?.rects ?? [],
            x: secondGeometry?.x ?? null,
            y: secondGeometry?.y ?? null
          }
        ],
        id: buildCrossPageMatchId(current.page, next.page, firstStart, rangeIndex),
        matchStart: firstStart,
        page: current.page,
        rects: firstGeometry?.rects ?? [],
        x: firstGeometry?.x ?? null,
        y: firstGeometry?.y ?? null
      });
    });
  }

  return matches;
}
