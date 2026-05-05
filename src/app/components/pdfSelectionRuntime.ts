import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

const CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS = 1000;
const TEXT_LAYER_SELECTOR = '.textLayer';
const TEXT_SEGMENT_SELECTOR = 'span[role="presentation"], div[role="presentation"], span, div';
const ROW_VERTICAL_TOLERANCE_PX = 6;
const ROW_CLAMP_INSET_PX = 1;

export interface PdfSelectionSnapshot {
  capturedAt: number;
  locator: NodeAnchorLink['locator'];
  selectionText: string;
}

interface TextSelectionDragState {
  activeLayer: HTMLElement | null;
}

function isSelectionNodeInside(container: HTMLElement, node: Node | null) {
  if (!node) {
    return false;
  }
  const normalizedNode = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  if (!normalizedNode) {
    return false;
  }
  return container.contains(normalizedNode);
}

function resolveTextLayerFromNode(node: Node | null) {
  if (!node) {
    return null;
  }
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(TEXT_LAYER_SELECTOR) ?? null;
}

function isSelectableTextSegment(node: HTMLElement) {
  return !node.classList.contains('endOfContent');
}

function resolveTextRowBounds(layer: HTMLElement, clientY: number) {
  const segments = Array.from(layer.querySelectorAll<HTMLElement>(TEXT_SEGMENT_SELECTOR))
    .filter(isSelectableTextSegment)
    .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);

  if (segments.length === 0) {
    return null;
  }

  const onRow = segments.filter(({ rect }) => clientY >= rect.top - ROW_VERTICAL_TOLERANCE_PX && clientY <= rect.bottom + ROW_VERTICAL_TOLERANCE_PX);
  const rowSegments = onRow.length > 0
    ? onRow
    : (() => {
        const nearest = segments.reduce<{ distance: number; rect: DOMRect } | null>((best, current) => {
          const centerY = current.rect.top + current.rect.height / 2;
          const distance = Math.abs(clientY - centerY);
          if (!best || distance < best.distance) {
            return { distance, rect: current.rect };
          }
          return best;
        }, null);
        if (!nearest) {
          return [];
        }
        return segments.filter(
          ({ rect }) =>
            Math.abs(rect.top - nearest.rect.top) <= ROW_VERTICAL_TOLERANCE_PX &&
            Math.abs(rect.bottom - nearest.rect.bottom) <= ROW_VERTICAL_TOLERANCE_PX
        );
      })();

  if (rowSegments.length === 0) {
    return null;
  }

  const left = Math.min(...rowSegments.map(({ rect }) => rect.left));
  const right = Math.max(...rowSegments.map(({ rect }) => rect.right));
  return right > left ? { left, right } : null;
}

function resolveCaretRangeFromPoint(clientX: number, clientY: number) {
  const domDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offset: number; offsetNode: Node } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof domDocument.caretPositionFromPoint === 'function') {
    const caretPosition = domDocument.caretPositionFromPoint(clientX, clientY);
    if (!caretPosition) {
      return null;
    }
    const range = document.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
    return range;
  }
  if (typeof domDocument.caretRangeFromPoint === 'function') {
    return domDocument.caretRangeFromPoint(clientX, clientY);
  }
  return null;
}

export function stabilizePdfTextSelectionToClosestRow(
  surface: HTMLElement,
  selection: Selection,
  activeLayer: HTMLElement | null,
  clientX: number,
  clientY: number
) {
  if (
    selection.isCollapsed ||
    selection.rangeCount === 0 ||
    !isSelectionNodeInside(surface, selection.anchorNode) ||
    !isSelectionNodeInside(surface, selection.focusNode) ||
    typeof selection.setBaseAndExtent !== 'function'
  ) {
    return false;
  }

  const layer = activeLayer ?? resolveTextLayerFromNode(selection.focusNode) ?? resolveTextLayerFromNode(selection.anchorNode);
  if (!layer || !surface.contains(layer)) {
    return false;
  }

  const rowBounds = resolveTextRowBounds(layer, clientY);
  if (!rowBounds || (clientX >= rowBounds.left && clientX <= rowBounds.right)) {
    return false;
  }

  const clampedX = Math.max(rowBounds.left + ROW_CLAMP_INSET_PX, Math.min(rowBounds.right - ROW_CLAMP_INSET_PX, clientX));
  const caretRange = resolveCaretRangeFromPoint(clampedX, clientY);
  if (!caretRange || !isSelectionNodeInside(layer, caretRange.startContainer)) {
    return false;
  }

  selection.setBaseAndExtent(selection.anchorNode!, selection.anchorOffset, caretRange.startContainer, caretRange.startOffset);
  return true;
}

function resolvePdfSelectionSnapshot(surface: HTMLElement | null): PdfSelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }
  const selectionText = resolvePdfSelectionText(surface, selection);
  if (!selectionText) {
    return null;
  }
  return {
    capturedAt: Date.now(),
    locator: resolvePdfSelectionLocator(surface, selection),
    selectionText
  };
}

function resolveFallbackSelection(snapshot: PdfSelectionSnapshot | null) {
  if (!snapshot) {
    return null;
  }
  return Date.now() - snapshot.capturedAt <= CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS ? snapshot : null;
}

export function resolveContextMenuSelection(surface: HTMLElement | null, preservedSelection: PdfSelectionSnapshot | null) {
  return resolvePdfSelectionSnapshot(surface) ?? resolveFallbackSelection(preservedSelection);
}

function createSelectionTrackingHandlers(
  surface: HTMLElement,
  preservedSelectionRef: MutableRefObject<PdfSelectionSnapshot | null>
) {
  const dragState: TextSelectionDragState = {
    activeLayer: null
  };

  const syncSelectionSnapshot = () => {
    const snapshot = resolvePdfSelectionSnapshot(surface);
    if (snapshot) {
      preservedSelectionRef.current = snapshot;
    }
  };

  return {
    handleMouseDown: (event: MouseEvent) => {
      if (event.button === 0) {
        const target = event.target instanceof Node ? event.target : null;
        dragState.activeLayer = resolveTextLayerFromNode(target);
      }
      if (event.button === 2) {
        syncSelectionSnapshot();
      }
    },
    handleMouseMove: (event: MouseEvent) => {
      if ((event.buttons & 1) === 0) {
        dragState.activeLayer = null;
        return;
      }
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      if (stabilizePdfTextSelectionToClosestRow(surface, selection, dragState.activeLayer, event.clientX, event.clientY)) {
        syncSelectionSnapshot();
      }
    },
    handleMouseUp: (event: MouseEvent) => {
      dragState.activeLayer = null;
      if (event.button !== 0) {
        return;
      }
      syncSelectionSnapshot();
    },
    syncSelectionSnapshot
  };
}

export function useTrackPdfSelection(
  surfaceRef: MutableRefObject<HTMLElement | null>,
  preservedSelectionRef: MutableRefObject<PdfSelectionSnapshot | null>
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const handlers = createSelectionTrackingHandlers(surface, preservedSelectionRef);

    document.addEventListener('selectionchange', handlers.syncSelectionSnapshot);
    document.addEventListener('mousemove', handlers.handleMouseMove, true);
    document.addEventListener('mouseup', handlers.handleMouseUp, true);
    surface.addEventListener('keyup', handlers.syncSelectionSnapshot, true);
    surface.addEventListener('mousedown', handlers.handleMouseDown, true);
    return () => {
      document.removeEventListener('selectionchange', handlers.syncSelectionSnapshot);
      document.removeEventListener('mousemove', handlers.handleMouseMove, true);
      document.removeEventListener('mouseup', handlers.handleMouseUp, true);
      surface.removeEventListener('keyup', handlers.syncSelectionSnapshot, true);
      surface.removeEventListener('mousedown', handlers.handleMouseDown, true);
    };
  }, [preservedSelectionRef, surfaceRef]);
}
