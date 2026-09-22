import type { MutableRefObject } from 'react';

import type { RuntimePdfDocumentSearchMatch } from '../../shared/platform/desktop/pdfDocumentSearchRuntimeRepository';

import type { PdfSearchMatch } from './pdfSearchMatchCollection';
import { resolvePageBounds } from './pdfSearchMatchCollectionUtils';
import { resolveGeometryFromRenderedSegments } from './pdfSearchMatchGeometry';
import { collectTextSegments } from './pdfSearchTextSegments';

function resolveFragmentGeometry(
  fragment: RuntimePdfDocumentSearchMatch['fragments'][number],
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>
) {
  const shell = pageElementsRef.current[fragment.page] ?? null;
  if (!shell) return { geometry: null, shell: document.createElement('div') };
  const pageBounds = resolvePageBounds(shell);
  const segments = collectTextSegments(shell);
  const geometry = segments.length > 0
    ? resolveGeometryFromRenderedSegments({
        matchStart: fragment.start,
        pageBounds,
        queryLength: fragment.end - fragment.start,
        segments
      })
    : null;
  return { geometry, shell };
}

export function collectIndexedPdfSearchMatches(
  matches: RuntimePdfDocumentSearchMatch[],
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>
): PdfSearchMatch[] {
  return matches.map((match) => {
    const fragments = match.fragments.map((fragment) => {
      const { geometry, shell } = resolveFragmentGeometry(fragment, pageElementsRef);
      return {
        element: geometry?.element ?? shell,
        page: fragment.page,
        rects: geometry?.rects ?? [],
        x: geometry?.x ?? null,
        y: geometry?.y ?? null
      };
    });
    const first = fragments[0];
    const fallback = pageElementsRef.current[match.page] ?? document.createElement('div');
    return {
      element: first?.element ?? fallback,
      fragments,
      id: match.id,
      matchStart: match.matchStart,
      page: match.page,
      rects: first?.rects ?? [],
      x: first?.x ?? null,
      y: first?.y ?? null
    };
  });
}
