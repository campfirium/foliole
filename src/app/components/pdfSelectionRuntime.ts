import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

const CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS = 1000;

export interface PdfSelectionSnapshot {
  capturedAt: number;
  locator: NodeAnchorLink['locator'];
  selectionText: string;
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
  const syncSelectionSnapshot = () => {
    const snapshot = resolvePdfSelectionSnapshot(surface);
    if (snapshot) {
      preservedSelectionRef.current = snapshot;
    }
  };

  return {
    handleMouseDown: (event: MouseEvent) => {
      if (event.button === 2) {
        syncSelectionSnapshot();
      }
    },
    handleMouseUp: (event: MouseEvent) => {
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
    surface.addEventListener('mouseup', handlers.handleMouseUp, true);
    surface.addEventListener('keyup', handlers.syncSelectionSnapshot, true);
    surface.addEventListener('mousedown', handlers.handleMouseDown, true);
    return () => {
      document.removeEventListener('selectionchange', handlers.syncSelectionSnapshot);
      surface.removeEventListener('mouseup', handlers.handleMouseUp, true);
      surface.removeEventListener('keyup', handlers.syncSelectionSnapshot, true);
      surface.removeEventListener('mousedown', handlers.handleMouseDown, true);
    };
  }, [preservedSelectionRef, surfaceRef]);
}
