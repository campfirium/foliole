import type { ReactNode } from 'react';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { FULL_PDF_VIEW } from '../../features/pdf/model/pdfReadingView';

import type { PdfPageDimensions } from './pdfPageDimensions';
import { rotatePdfNormalizedRect } from './pdfVisualExcerptGeometry';

export function PdfPageCropFrame(props: {
  children: (args: { onTextLayerRender: () => void; pageRef: (element: HTMLDivElement | null) => void }) => ReactNode;
  pageDimensions: PdfPageDimensions;
  rotation?: number;
}) {
  const runtime = usePdfReadingView();
  const crop = rotatePdfNormalizedRect(runtime?.crop ?? FULL_PDF_VIEW, props.rotation ?? 0);
  const width = props.pageDimensions.width, height = props.pageDimensions.height;
  return (
    <div className="pdf-document-page-crop-frame shrink-0 overflow-hidden"
      data-testid="pdf-document-page-crop-frame"
      data-pdf-view-mode={runtime?.view.mode ?? 'auto'}
      style={{ width: width * crop.width, height: height * crop.height }}>
      <div className="pdf-document-page-crop-content relative inline-block"
        style={{ marginLeft: -width * crop.x, marginTop: -height * crop.y }}>
        {props.children({ onTextLayerRender: () => undefined, pageRef: () => undefined })}
      </div>
    </div>
  );
}
