import type { MutableRefObject } from 'react';

const PDF_PAGE_MIN = 1;

type PdfPageElementsRef = MutableRefObject<Record<number, HTMLDivElement | null>>;

export function resolveVisiblePage(container: HTMLDivElement, pageElementsRef: PdfPageElementsRef, totalPages: number) {
  const anchor = container.scrollTop + container.clientHeight * 0.35;
  let visiblePage = PDF_PAGE_MIN;
  for (let index = PDF_PAGE_MIN; index <= totalPages; index += 1) {
    const element = pageElementsRef.current[index];
    if (!element) {
      continue;
    }
    if (element.offsetTop <= anchor) {
      visiblePage = index;
    } else {
      break;
    }
  }
  return visiblePage;
}

export function resolveVisiblePositionY(container: HTMLDivElement, pageElement: HTMLDivElement | null) {
  if (!pageElement) {
    return 0;
  }
  const anchor = container.scrollTop + container.clientHeight * 0.35;
  return Math.max(0, Math.min(1, (anchor - pageElement.offsetTop) / Math.max(pageElement.clientHeight, 1)));
}
