import { memo } from 'react';
import { Page } from 'react-pdf';

import { definedProps } from '../../shared/lib/definedProps';

import { PdfOfficialTextLayer } from './PdfOfficialTextLayer';
import { resolvePdfCanvasPixelRatio, resolvePdfPageDimensions, type PdfPageDimensions } from './pdfPageDimensions';
import { resolvePageText, type PdfPageTextEntry } from './pdfPageText';
import { useOptionalPdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

interface PdfPageCanvasProps {
  fitWidthTargetWidth: number | null;
  onPageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void;
  onPageRenderReady?: (pageNumber: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: () => void;
  pageDimensions?: PdfPageDimensions | null;
  pageRef?: (element: HTMLDivElement | null) => void;
  pageNumber: number;
  renderCanvas?: boolean;
  rotate: number;
  zoomMode: 'custom' | 'fit-width';
  zoom?: number;
}

export const PdfPageCanvas = memo(
  function PdfPageCanvas(props: PdfPageCanvasProps) {
    const visualExcerpt = useOptionalPdfVisualExcerptRuntime();
    const devicePixelRatio = props.pageDimensions
      ? resolvePdfCanvasPixelRatio({
          dimensions: props.pageDimensions,
          fitWidth: props.fitWidthTargetWidth,
          rotation: props.rotate,
          zoom: props.zoom ?? 100,
          zoomMode: props.zoomMode,
          devicePixelRatio: window.devicePixelRatio || 1
        })
      : undefined;
    return (
      <Page
        className={`mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-page ${props.renderCanvas === false ? 'h-full w-full' : ''}`}
        {...definedProps({ inputRef: props.pageRef })}
        onLoadSuccess={(page: unknown) => {
          visualExcerpt?.registerPage(props.pageNumber, page as Parameters<NonNullable<typeof visualExcerpt>['registerPage']>[1]);
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
        renderMode={props.renderCanvas === false ? 'none' : 'canvas'}
        renderAnnotationLayer
        renderTextLayer={false}
        rotate={props.rotate}
        {...definedProps({
          devicePixelRatio,
          scale: props.zoomMode === 'fit-width' ? undefined : (props.zoom ?? 100) / 100,
          width: props.zoomMode === 'fit-width' ? props.fitWidthTargetWidth ?? undefined : undefined
        })}
      >
        <PdfOfficialTextLayer />
      </Page>
    );
  },
  (previous, next) =>
    previous.fitWidthTargetWidth === next.fitWidthTargetWidth &&
    previous.pageNumber === next.pageNumber &&
    previous.pageDimensions?.height === next.pageDimensions?.height &&
    previous.pageDimensions?.width === next.pageDimensions?.width &&
    previous.rotate === next.rotate &&
    previous.renderCanvas === next.renderCanvas &&
    previous.zoom === next.zoom &&
    previous.zoomMode === next.zoomMode
);
