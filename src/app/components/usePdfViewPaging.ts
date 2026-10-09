import { useEffect, type MutableRefObject } from 'react';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { isImmersiveEditableElement } from './immersiveReadingKeyboard';

export function usePdfViewPaging(props: {
  pageJumpRequest: PdfJumpRequest | null;
  onNextPage: () => void;
  onPreviousPage: () => void;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const view = usePdfReadingView();
  const active = Boolean(view?.ready && view.view.mode !== 'free' && !view.editing);
  const fitToPage = view?.fitToPage;
  useEffect(() => {
    const request = props.pageJumpRequest;
    if (active && request && request.positionY === undefined) fitToPage?.(request.page);
  }, [active, fitToPage, props.pageJumpRequest]);
  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.altKey || event.ctrlKey || event.metaKey ||
        event.defaultPrevented || isImmersiveEditableElement(event.target)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const container = props.scrollContainerRef.current;
      if (!container || container.clientHeight === 0) return;
      const surface = container.closest('[data-testid="pdf-document-surface"]');
      if (target && target !== document.body && target !== document.documentElement &&
        surface && !surface.contains(target)) return;
      if (target?.closest('button,[role="button"],[role="menu"],[role="dialog"],[role="combobox"]')) return;
      event.preventDefault();
      if (event.repeat || props.pageJumpRequest) return;
      if (event.shiftKey) props.onPreviousPage();
      else props.onNextPage();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, props.onNextPage, props.onPreviousPage, props.pageJumpRequest, props.scrollContainerRef]);
}
