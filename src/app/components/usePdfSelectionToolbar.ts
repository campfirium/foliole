import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import { resolvePdfSelectionSnapshot, type PdfSelectionSnapshot } from './pdfSelectionRuntime';

const TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET = 22;
const TOOLBAR_WIDTH = 48;

function resolveToolbarPosition(event: MouseEvent | KeyboardEvent) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range && typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  const pointerX = event instanceof MouseEvent ? event.clientX : null;
  const anchorX = pointerX && pointerX > 0 ? pointerX : (rect?.left ?? 8) + (rect?.width ?? 0) / 2;
  return {
    left: Math.max(8, Math.min(anchorX - TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET, window.innerWidth - TOOLBAR_WIDTH - 8)),
    top: Math.max(8, (rect?.top ?? 54) - 46)
  };
}

export function usePdfSelectionToolbar(input: {
  onClose: () => void;
  onOpen: (snapshot: PdfSelectionSnapshot, position: { left: number; top: number }) => void;
  surfaceRef: MutableRefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const surface = input.surfaceRef.current;
    if (!surface) return undefined;
    const openFromCompletedSelection = (event: MouseEvent | KeyboardEvent) => {
      const snapshot = resolvePdfSelectionSnapshot(surface);
      if (snapshot) input.onOpen(snapshot, resolveToolbarPosition(event));
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0 && event.target instanceof Node && surface.contains(event.target)) {
        openFromCompletedSelection(event);
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 && !(event.target instanceof Element && event.target.closest('[data-annotation-toolbar="true"]'))) {
        input.onClose();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        input.onClose();
        return;
      }
      openFromCompletedSelection(event);
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    surface.addEventListener('keyup', handleKeyUp, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      surface.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [input]);
}
