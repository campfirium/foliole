import { renderPdfPage, renderPdfPagePlaceholder } from './PdfDocumentPageRender';
import type { PdfPageDimensions } from './pdfPageDimensions';

export function renderDocumentPages(totalPages: number, renderedPageNumbers: number[], args: Omit<Parameters<typeof renderPdfPage>[0], 'pageNumber'> & {
  pageDimensionsByNumber: Record<number, PdfPageDimensions>;
}) {
  const renderedPageNumberSet = new Set(renderedPageNumbers);
  return Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
    if (renderedPageNumberSet.has(pageNumber)) {
      return renderPdfPage({
        ...args,
        pageDimensions: args.pageDimensionsByNumber[pageNumber] ?? null,
        pageNumber
      });
    }
    return renderPdfPagePlaceholder({
      fitWidthTargetWidth: args.fitWidthTargetWidth,
      pageDimensions: args.pageDimensionsByNumber[pageNumber] ?? null,
      pageElementsRef: args.pageElementsRef,
      pageNumber,
      rotation: args.rotation,
      zoomMode: args.zoomMode,
      zoom: args.zoom
    });
  });
}

export async function collectPdfPageDimensions(
  document: { getPage?: (pageNumber: number) => Promise<unknown>; numPages: number },
  knownDimensions: Record<number, PdfPageDimensions> = {}
) {
  if (typeof document.getPage !== 'function') {
    return knownDimensions;
  }
  const result = { ...knownDimensions };
  const missingPages = Array.from({ length: document.numPages }, (_, index) => index + 1)
    .filter((pageNumber) => !result[pageNumber]);
  let cursor = 0;
  const loadNext = async (): Promise<void> => {
    const pageNumber = missingPages[cursor];
    cursor += 1;
    if (!pageNumber) return;
    const page = await document.getPage?.(pageNumber);
    const dimensions = resolvePageDimensionsFromDocumentPage(page);
    if (dimensions) result[pageNumber] = dimensions;
    await loadNext();
  };
  await Promise.all(Array.from({ length: Math.min(4, missingPages.length) }, () => loadNext()));
  return result;
}

function resolvePageDimensionsFromDocumentPage(page: unknown): PdfPageDimensions | null {
  if (!page || typeof page !== 'object') {
    return null;
  }
  const candidate = page as { getViewport?: (input: { scale: number }) => { height?: number; width?: number } };
  if (typeof candidate.getViewport !== 'function') {
    return null;
  }
  const viewport = candidate.getViewport({ scale: 1 });
  if (
    typeof viewport.width !== 'number' ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    typeof viewport.height !== 'number' ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    return null;
  }
  return { height: viewport.height, width: viewport.width };
}
