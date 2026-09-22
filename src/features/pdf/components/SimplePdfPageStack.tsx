import { useCallback, useMemo, useState, type RefObject } from 'react';

import { VirtualListSurface } from '../../../shared/ui/VirtualListSurface';
import type { PdfCropBox } from '../model/pdfAutoCrop';

import { SimplePdfPage } from './SimplePdfPage';
import { useSimplePdfPosition } from './useSimplePdfPosition';

const pageKey = (page: number) => String(page);

export function SimplePdfPageStack(props: {
  initialPage: number | undefined;
  pageWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  totalPages: number;
}) {
  const pages = useMemo(() => Array.from({ length: props.totalPages }, (_, index) => index + 1), [props.totalPages]);
  const initialPage = Math.max(1, Math.min(props.initialPage ?? 1, props.totalPages));
  const { onLayoutReady, pinned, position } = useSimplePdfPosition(props.scrollRef, props.pageWidth, initialPage);
  const estimateSize = useCallback(() => props.pageWidth * 1.414 + 12, [props.pageWidth]);
  return (
    <div className="min-w-full" style={{ width: props.pageWidth, paddingBottom: 'calc(100dvh - 12rem)' }}>
      <VirtualListSurface key={props.pageWidth} items={pages} getItemKey={pageKey} estimateSize={estimateSize}
        scrollElementRef={props.scrollRef} position={position} pinnedItemKey={pinned === null ? null : String(pinned)}
        accountForOffset measureItems overscan={2} threshold={1} autoScroll={false}
        renderItem={(page) => <WindowPage page={page} width={props.pageWidth} focused={props.initialPage === page} onLayoutReady={onLayoutReady} />} />
    </div>
  );
}

function WindowPage(props: { page: number; width: number; focused: boolean; onLayoutReady(page: number): void }) {
  const [measured, setMeasured] = useState(false);
  const [cropBox, setCropBox] = useState<PdfCropBox | null>(null);
  return <div className="flex justify-center pb-3" style={measured ? undefined : { minHeight: props.width * 1.414 }}>
    <SimplePdfPage cropBox={cropBox} isFocused={props.focused} onCropBoxChange={(box) => { setCropBox(box); setMeasured(true); }}
      onLayoutReady={() => props.onLayoutReady(props.page)} pageNumber={props.page} width={props.width} />
  </div>;
}
