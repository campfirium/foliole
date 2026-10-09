import { useEffect, useState, type MutableRefObject } from 'react';

import { usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';

import { useOptionalPdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

export function usePdfToolbarDismiss(args: {
  active: boolean;
  floating: boolean;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const excerpt = useOptionalPdfVisualExcerptRuntime();
  const { dismiss } = usePdfTopBars();
  const canDismiss = args.floating && excerpt?.interactionMode !== 'quick';
  useEffect(() => {
    if (args.active || !args.floating) setDismissed(false);
  }, [args.active, args.floating]);
  useEffect(() => {
    const container = args.scrollContainerRef.current;
    if (!container || !canDismiss) return;
    let start: { x: number; y: number } | null = null;
    let dragged = false;
    const down = (event: MouseEvent) => {
      start = { x: event.clientX, y: event.clientY };
      dragged = false;
    };
    const move = (event: MouseEvent) => {
      if (start && event.buttons !== 0 && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) dragged = true;
    };
    const click = (event: MouseEvent) => {
      const moved = start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4;
      start = null;
      if (dragged || moved || event.button !== 0 || event.altKey || event.detail > 1) return;
      if (!(event.target instanceof Element) || !event.target.closest('.pdf-document-page-frame')) return;
      if (event.target.closest('[data-pdf-view-range-selection]')) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      setDismissed(true);
      dismiss();
    };
    container.addEventListener('mousedown', down);
    container.addEventListener('mousemove', move);
    container.addEventListener('click', click);
    return () => {
      container.removeEventListener('mousedown', down);
      container.removeEventListener('mousemove', move);
      container.removeEventListener('click', click);
    };
  }, [args.scrollContainerRef, canDismiss, dismiss]);
  return { dismissed, restore: () => setDismissed(false) };
}
