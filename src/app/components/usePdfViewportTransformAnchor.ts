import { useLayoutEffect, useRef, type RefObject } from 'react';

import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { resolvePageJumpTop, scrollContainerToTop } from './pdfPageJumpScroll';

interface ReadingViewport {
  handleScroll: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSource: string;
  positionY: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function usePdfViewportTransformAnchor(
  viewport: ReadingViewport,
  { heightFit, ready, transform }: { heightFit: boolean; ready: boolean; transform: string }
) {
  const { page, pageElementsRef, pdfSource, positionY, scrollContainerRef } = viewport;
  const previousLayout = useRef({ pdfSource, transform });
  const appliedScrollTop = useRef<number | null>(null);

  useLayoutEffect(() => {
    const previous = previousLayout.current;
    previousLayout.current = { pdfSource, transform };
    if (previous.pdfSource !== pdfSource) appliedScrollTop.current = null;
    if (!ready || heightFit || previous.pdfSource !== pdfSource || previous.transform === transform) return;

    const container = scrollContainerRef.current;
    const shell = pageElementsRef.current[page];
    if (!container?.clientHeight || !shell) return;
    const previousTop = container.scrollTop;
    // The page frame already has its new height while the replacement canvas is still loading.
    const frame = { top: shell.offsetTop, height: shell.clientHeight };
    const top = resolvePageJumpTop(container, shell, positionY === 0 ? null : positionY, frame);
    scrollContainerToTop(container, top, 'instant');
    if (container.scrollTop !== previousTop) appliedScrollTop.current = container.scrollTop;
  }, [heightFit, page, pageElementsRef, pdfSource, positionY, ready, scrollContainerRef, transform]);

  return () => {
    const applied = appliedScrollTop.current;
    appliedScrollTop.current = null;
    // Reflow applies the existing reading position. Its scroll event must not write it back.
    if (applied !== null && applied === scrollContainerRef.current?.scrollTop) return;
    viewport.handleScroll();
  };
}
