import { useEffect, useState } from 'react';

function selectionShell(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>('[data-pdf-page-number]') ?? null;
}

export function resolvePdfSelectedPageNumbers(container: HTMLElement, selection: Selection | null): number[] {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const start = selectionShell(selection.getRangeAt(0).startContainer);
  const end = selectionShell(selection.getRangeAt(0).endContainer);
  if (!start || !end || !container.contains(start) || !container.contains(end)) return [];
  const first = Number(start.dataset.pdfPageNumber);
  const last = Number(end.dataset.pdfPageNumber);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function usePdfSelectedPageNumbers(pageElements: { current: Record<number, HTMLElement | null> }) {
  const [pages, setPages] = useState<number[]>([]);
  useEffect(() => {
    const sync = () => {
      const shell = Object.values(pageElements.current).find(element => element !== null);
      const surface = shell?.closest<HTMLElement>('[data-testid="pdf-document-surface"]');
      const next = surface ? resolvePdfSelectedPageNumbers(surface, window.getSelection()) : [];
      setPages(current => current.join(',') === next.join(',') ? current : next);
    };
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, [pageElements]);
  return pages;
}

export function intersectPdfTextLayerRange(range: Range, layer: HTMLElement): Range | null {
  if (!range.intersectsNode(layer)) return null;
  const fragment = document.createRange();
  fragment.selectNodeContents(layer);
  if (range.compareBoundaryPoints(Range.START_TO_START, fragment) > 0) fragment.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, fragment) < 0) fragment.setEnd(range.endContainer, range.endOffset);
  return fragment.collapsed ? null : fragment;
}
