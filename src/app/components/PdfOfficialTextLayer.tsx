import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { useLayoutEffect, useRef } from 'react';
import { usePageContext } from 'react-pdf';

export function PdfOfficialTextLayer() {
  const context = usePageContext();
  const callbacks = useRef(context);
  callbacks.current = context;
  const host = useRef<HTMLDivElement | null>(null);
  const page = context?.page;
  const rotate = context?.rotate;
  const scale = context?.scale;

  useLayoutEffect(() => {
    const container = host.current;
    if (!container || !page || rotate === undefined || scale === undefined) return;
    let cancelled = false;
    const layer = new TextLayerBuilder({
      pdfPage: page,
      onAppend: (element: HTMLDivElement) => {
        if (!cancelled) container.append(element);
      }
    });
    void Promise.all([
      page.getTextContent(),
      layer.render({
        viewport: page.getViewport({ scale, rotation: rotate }),
        textContentParams: { includeMarkedContent: true, disableNormalization: false }
      })
    ]).then(([textContent]) => {
      if (cancelled) return;
      callbacks.current?.onGetTextSuccess?.(textContent);
      callbacks.current?.onRenderTextLayerSuccess?.();
    }).catch((error: unknown) => {
      if (!cancelled && error instanceof Error && error.name !== 'AbortException') {
        callbacks.current?.onRenderTextLayerError?.(error);
        console.error('PDF text layer rendering failed', error);
      }
    });
    return () => {
      cancelled = true;
      layer.cancel();
      layer.div.remove();
    };
  }, [page, rotate, scale]);

  return <div ref={host} className="absolute inset-0" data-testid="pdf-official-text-layer" />;
}
