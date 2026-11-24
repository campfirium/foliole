import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';

import { resolvePdfSelectionContent } from './pdfSelectionText';

const CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS = 1000;
export interface PdfSelectionSnapshot {
  capturedAt: number;
  locator: PdfSelectionLocator;
  selectionText: string;
}

type PdfSelectionChangeHandler = (locator: PdfSelectionLocator | undefined) => void;

export function resolvePdfSelectionSnapshot(surface: HTMLElement | null): PdfSelectionSnapshot | null {
  const selection = resolvePdfSelectionContent(surface, window.getSelection());
  return selection ? { ...selection, capturedAt: Date.now() } : null;
}

const eventSelections = new WeakMap<Event, { surface: HTMLElement; snapshot: PdfSelectionSnapshot | null }>();

/** The selection overlay and toolbar are notified by the same native events. */
export function resolvePdfSelectionForEvent(surface: HTMLElement, event: Event) {
  const previous = eventSelections.get(event);
  if (previous?.surface === surface) return previous.snapshot;
  const snapshot = resolvePdfSelectionSnapshot(surface);
  eventSelections.set(event, { surface, snapshot });
  return snapshot;
}

function resolveFallbackSelection(snapshot: PdfSelectionSnapshot | null) {
  if (!snapshot) {
    return null;
  }
  return Date.now() - snapshot.capturedAt <= CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS ? snapshot : null;
}

export function resolveContextMenuSelection(surface: HTMLElement | null, preservedSelection: PdfSelectionSnapshot | null) {
  const snapshot = resolvePdfSelectionSnapshot(surface);
  if (snapshot) return snapshot;
  if (window.getSelection()?.isCollapsed === false) return null;
  return resolveFallbackSelection(preservedSelection);
}

function createSelectionTrackingHandlers(
  surface: HTMLElement,
  preservedSelectionRef: MutableRefObject<PdfSelectionSnapshot | null>,
  onSelectionChange?: PdfSelectionChangeHandler
) {
  const syncSelectionSnapshot = (event: Event) => {
    const snapshot = resolvePdfSelectionForEvent(surface, event);
    if (snapshot || window.getSelection()?.isCollapsed === false) {
      preservedSelectionRef.current = snapshot;
    }
    onSelectionChange?.(snapshot?.locator);
  };

  return {
    handleMouseDown: (event: MouseEvent) => {
      if (event.button === 2) {
        syncSelectionSnapshot(event);
      }
    },
    handleMouseUp: (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      syncSelectionSnapshot(event);
    },
    syncSelectionSnapshot
  };
}

export function useTrackPdfSelection(
  surfaceRef: MutableRefObject<HTMLElement | null>,
  preservedSelectionRef: MutableRefObject<PdfSelectionSnapshot | null>,
  onSelectionChange?: PdfSelectionChangeHandler
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const handlers = createSelectionTrackingHandlers(surface, preservedSelectionRef, onSelectionChange);

    document.addEventListener('selectionchange', handlers.syncSelectionSnapshot);
    document.addEventListener('mouseup', handlers.handleMouseUp, true);
    surface.addEventListener('pdftextlayerready', handlers.syncSelectionSnapshot);
    surface.addEventListener('keyup', handlers.syncSelectionSnapshot, true);
    surface.addEventListener('mousedown', handlers.handleMouseDown, true);
    return () => {
      document.removeEventListener('selectionchange', handlers.syncSelectionSnapshot);
      document.removeEventListener('mouseup', handlers.handleMouseUp, true);
      surface.removeEventListener('pdftextlayerready', handlers.syncSelectionSnapshot);
      surface.removeEventListener('keyup', handlers.syncSelectionSnapshot, true);
      surface.removeEventListener('mousedown', handlers.handleMouseDown, true);
    };
  }, [onSelectionChange, preservedSelectionRef, surfaceRef]);
}
