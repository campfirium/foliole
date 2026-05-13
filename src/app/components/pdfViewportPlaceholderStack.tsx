import { renderPdfPagePlaceholder } from './PdfDocumentPageRender';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageDimensions } from './pdfPageDimensions';

interface PdfViewportPlaceholderStackProps {
  fitWidthTargetWidth: number | null;
  pageElementsRef: PdfPageElementsRef;
  pageDimensionsByNumber: Record<number, PdfPageDimensions>;
  persistedPageCount: number | null;
  rotation: number;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfViewportPlaceholderStack(props: PdfViewportPlaceholderStackProps) {
  const totalPages = props.totalPages ?? props.persistedPageCount;
  if (!totalPages) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-none flex-col items-center gap-4" data-testid="pdf-document-placeholder-stack">
      {Array.from({ length: totalPages }, (_, index) =>
        renderPdfPagePlaceholder({
          fitWidthTargetWidth: props.fitWidthTargetWidth,
          pageDimensions: props.pageDimensionsByNumber[index + 1] ?? null,
          pageElementsRef: props.pageElementsRef,
          pageNumber: index + 1,
          rotation: props.rotation,
          zoomMode: props.zoomMode,
          zoom: props.zoom
        })
      )}
    </div>
  );
}
