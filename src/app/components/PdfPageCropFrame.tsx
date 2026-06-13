import { useRef, useState, type ReactNode } from 'react';

import { measurePdfTextLayerCropBox, resolvePdfCropScale, type PdfCropBox } from '../../features/pdf/model/pdfAutoCrop';

import type { PdfPageDimensions } from './pdfPageDimensions';

function measureCropBoxAfterTextLayout(element: HTMLElement | null, onCropBoxChange: (cropBox: PdfCropBox | null) => void) {
  if (!element) {
    onCropBoxChange(null);
    return;
  }
  window.requestAnimationFrame(() => {
    const cropBox = measurePdfTextLayerCropBox(element);
    if (cropBox) {
      onCropBoxChange(cropBox);
      return;
    }
    window.setTimeout(() => onCropBoxChange(measurePdfTextLayerCropBox(element)), 80);
  });
}

export function PdfPageCropFrame(props: {
  children: (args: { onTextLayerRender: () => void; pageRef: (element: HTMLDivElement | null) => void }) => ReactNode;
  pageDimensions: PdfPageDimensions;
}) {
  const [cropBox, setCropBox] = useState<PdfCropBox | null>(null);
  const pageElementRef = useRef<HTMLDivElement | null>(null);
  const cropScale = cropBox ? resolvePdfCropScale(props.pageDimensions.width, cropBox) : 1;
  const frameStyle = cropBox
    ? {
        width: (cropBox.right - cropBox.left) * cropScale
      }
    : undefined;
  const pageStyle = cropBox
    ? {
        marginLeft: -cropBox.left * cropScale,
        transform: `scale(${cropScale})`,
        transformOrigin: 'top left'
      }
    : undefined;

  return (
    <div className="pdf-document-page-crop-frame overflow-hidden" data-testid="pdf-document-page-crop-frame" style={frameStyle}>
      <div className="pdf-document-page-crop-content relative inline-block" style={pageStyle}>
        {props.children({
          onTextLayerRender: () => measureCropBoxAfterTextLayout(pageElementRef.current, setCropBox),
          pageRef: (element) => {
            pageElementRef.current = element;
          }
        })}
      </div>
    </div>
  );
}
