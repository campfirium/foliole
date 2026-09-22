import { useRef } from 'react';
import { Page } from 'react-pdf';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { resolvePdfCropScale, type PdfCropBox } from '../model/pdfAutoCrop';

import { useSimplePdfCropMeasurement } from './useSimplePdfCropMeasurement';

export function SimplePdfPage(props: {
  cropBox: PdfCropBox | null;
  isFocused: boolean;
  onCropBoxChange(cropBox: PdfCropBox | null): void;
  onLayoutReady?(): void;
  pageNumber: number;
  width: number | undefined;
}) {
  const t = useTranslation();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const onTextLayerReady = useSimplePdfCropMeasurement({ ...props, pageRef });
  const width = props.width ?? 1;
  const cropScale = props.cropBox ? resolvePdfCropScale(width, props.cropBox) : 1;
  const cropWidth = props.cropBox ? (props.cropBox.right - props.cropBox.left) * cropScale : props.width;
  const cropHeight = props.cropBox ? (props.cropBox.bottom - props.cropBox.top) * cropScale : undefined;
  return (
    <div
      aria-current={props.isFocused ? 'page' : undefined}
      className={`flex flex-col ${props.isFocused ? 'gap-1 outline outline-2 outline-offset-[-2px] outline-companion-accent' : ''}`}
      data-pdf-page={props.pageNumber}
      style={{ width: cropWidth }}
    >
      {props.isFocused ? (
        <span className="self-end rounded-full border border-companion-accent bg-companion-accent-soft px-2 py-1 text-xs font-semibold text-companion-accent">
          {t('companion.search.pdfPage', { page: props.pageNumber })}
        </span>
      ) : null}
      <div className="overflow-hidden bg-companion-surface shadow-page" style={{ height: cropHeight, width: cropWidth }}>
        <div ref={pageRef} style={props.cropBox ? { marginLeft: -props.cropBox.left * cropScale, marginTop: -props.cropBox.top * cropScale, transform: `scale(${cropScale})`, transformOrigin: 'top left' } : undefined}>
          <Page
            inputRef={pageRef}
            onRenderTextLayerSuccess={onTextLayerReady}
            pageNumber={props.pageNumber}
            renderAnnotationLayer
            renderTextLayer
            {...(props.width !== undefined ? { width: props.width } : {})}
          />
        </div>
      </div>
    </div>
  );
}
