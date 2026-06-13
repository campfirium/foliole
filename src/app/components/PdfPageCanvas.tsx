import { memo } from 'react';
import { Page } from 'react-pdf';

import { definedProps } from '../../shared/lib/definedProps';

import { resolvePdfPageDimensions, type PdfPageDimensions } from './pdfPageDimensions';
import { resolvePageText, type PdfPageTextEntry } from './pdfPageText';

export const PdfPageCanvas = memo(
  function PdfPageCanvas(props: {
    fitWidthTargetWidth: number | null;
    onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
    onPageRenderReady?: (pageNumber: number) => void;
    onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    onTextLayerRender: () => void;
    pageDimensions?: PdfPageDimensions | null;
    pageRef?: (element: HTMLDivElement | null) => void;
    pageNumber: number;
    rotate: number;
    zoomMode: 'custom' | 'fit-width';
    zoom?: number;
  }) {
    return (
      <Page
        className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-page"
        {...definedProps({ inputRef: props.pageRef })}
        onLoadSuccess={(page: unknown) => {
          const dimensions = resolvePdfPageDimensions(page);
          if (dimensions) {
            props.onPageLoadSuccess(props.pageNumber, dimensions);
          }
        }}
        data-testid="pdf-document-page"
        onGetTextSuccess={(textContent: unknown) => {
          props.onTextContentLoad(props.pageNumber, resolvePageText(textContent));
        }}
        loading={null}
        onRenderSuccess={() => {
          props.onPageRenderReady?.(props.pageNumber);
        }}
        onRenderTextLayerSuccess={() => {
          props.onTextLayerRender();
        }}
        pageNumber={props.pageNumber}
        renderAnnotationLayer
        renderTextLayer
        rotate={props.rotate}
        {...definedProps({
          scale: props.zoomMode === 'fit-width' ? undefined : (props.zoom ?? 100) / 100,
          width: props.zoomMode === 'fit-width' ? props.fitWidthTargetWidth ?? undefined : undefined
        })}
      />
    );
  },
  (previous, next) =>
    previous.fitWidthTargetWidth === next.fitWidthTargetWidth &&
    previous.pageNumber === next.pageNumber &&
    previous.rotate === next.rotate &&
    previous.zoom === next.zoom &&
    previous.zoomMode === next.zoomMode
);
