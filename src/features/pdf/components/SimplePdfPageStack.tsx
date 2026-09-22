import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { VirtualListSurface } from '../../../shared/ui/VirtualListSurface';
import type { PdfCropBox } from '../model/pdfAutoCrop';

import { SimplePdfPage } from './SimplePdfPage';
import { useSimplePdfEndPadding } from './useSimplePdfEndPadding';
import { useSimplePdfPosition } from './useSimplePdfPosition';

interface PageLayout { cropBox: PdfCropBox | null; height: number }

const pageKey = (page: number) => String(page);

export function SimplePdfPageStack(props: {
  initialPage: number | undefined;
  pageWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  totalPages: number;
}) {
  const pages = useMemo(() => Array.from({ length: props.totalPages }, (_, index) => index + 1), [props.totalPages]);
  // Retain only layout metadata when a page leaves the rendering window.
  const crops = useMemo(() => new Map<number, PageLayout>(), [props.pageWidth]);
  const [lastPage, setLastPage] = useState<{ width: number; page: number; height: number }>();
  const onMeasured = useCallback((page: number, layout: PageLayout) => {
    crops.set(page, layout);
    if (page === props.totalPages) setLastPage({ width: props.pageWidth, page, height: layout.height });
  }, [crops, props.pageWidth, props.totalPages]);
  const lastHeight = lastPage?.width === props.pageWidth && lastPage.page === props.totalPages
    ? lastPage.height : props.pageWidth * 1.414 + 12;
  const paddingBottom = useSimplePdfEndPadding(props.scrollRef, lastHeight);
  const initialPage = Math.max(1, Math.min(props.initialPage ?? 1, props.totalPages));
  const { onLayoutReady, pinned, position } = useSimplePdfPosition(props.scrollRef, props.pageWidth, initialPage);
  const estimateSize = useCallback((index: number) => crops.get(index + 1)?.height ?? props.pageWidth * 1.414 + 12, [crops, props.pageWidth]);
  return (
    <div className="min-w-full" style={{ width: props.pageWidth, paddingBottom }}>
      <VirtualListSurface key={props.pageWidth} items={pages} getItemKey={pageKey} estimateSize={estimateSize}
        scrollElementRef={props.scrollRef} position={position} pinnedItemKey={pinned === null ? null : String(pinned)}
        accountForOffset measureItems overscan={2} threshold={1} autoScroll={false}
        renderItem={(page) => <WindowPage onMeasured={onMeasured} crops={crops} page={page} width={props.pageWidth} focused={props.initialPage === page} onLayoutReady={onLayoutReady} />} />
    </div>
  );
}

function WindowPage(props: { onMeasured(page: number, layout: PageLayout): void; crops: Map<number, PageLayout>; page: number; width: number; focused: boolean; onLayoutReady(page: number): void }) {
  const [measured, setMeasured] = useState(() => props.crops.has(props.page));
  const [cropBox, setCropBox] = useState<PdfCropBox | null>(() => props.crops.get(props.page)?.cropBox ?? null);
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (measured && rowRef.current) props.onMeasured(props.page, { cropBox, height: rowRef.current.getBoundingClientRect().height });
  }, [cropBox, measured, props.onMeasured, props.focused, props.page]);
  return <div ref={rowRef} className="flex justify-center pb-3" style={measured ? undefined : { minHeight: props.width * 1.414 }}>
    <SimplePdfPage cropBox={cropBox} isFocused={props.focused} onCropBoxChange={(box) => { setCropBox(box); setMeasured(true); }}
      onLayoutReady={() => props.onLayoutReady(props.page)} pageNumber={props.page} width={props.width} />
  </div>;
}
