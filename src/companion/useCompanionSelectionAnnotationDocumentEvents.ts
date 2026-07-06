import { useEffect, type MutableRefObject } from 'react';

import * as toolbarDom from './companionSelectionToolbarDom';
import {
  getDefaultSelectionClientPoint,
  isExistingHighlightTarget,
  readSelectionClientPoint,
  type CompanionSelectionClientPoint
} from './companionSelectionToolbarState';

export function useCompanionSelectionAnnotationDocumentEvents(args: {
  closeSelectionToolbar: () => void;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint, allowExistingHighlight?: boolean) => void;
}) {
  useEffect(() => {
    const rememberSelectionInteraction = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      if (isExistingHighlightTarget(event.target)) toolbarDom.activateCompanionHighlightTarget(event.target);
      else toolbarDom.clearCompanionActiveHighlightElements();
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      args.closeSelectionToolbar();
    };
    const handleSelectionEnd = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      if (isExistingHighlightTarget(event.target)) toolbarDom.activateCompanionHighlightTarget(event.target);
      else toolbarDom.clearCompanionActiveHighlightElements();
      args.scheduleSelectionToolbarOpen(args.lastFallbackRef.current, isExistingHighlightTarget(event.target));
    };
    const handleSelectionChange = () => {
      if (toolbarDom.isCompanionSelectionToolbarActiveElement()) return;
      if (toolbarDom.hasRecentSelectionInteraction(args.lastSelectionInteractionAtRef.current)) {
        args.scheduleSelectionToolbarOpen(undefined, false);
      }
    };
    document.addEventListener('pointerdown', rememberSelectionInteraction, true);
    document.addEventListener('pointermove', rememberSelectionInteraction, true);
    document.addEventListener('pointerup', handleSelectionEnd, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionEnd, true);
    document.addEventListener('touchmove', rememberSelectionInteraction, true);
    return () => {
      document.removeEventListener('pointerdown', rememberSelectionInteraction, true);
      document.removeEventListener('pointermove', rememberSelectionInteraction, true);
      document.removeEventListener('pointerup', handleSelectionEnd, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionEnd, true);
      document.removeEventListener('touchmove', rememberSelectionInteraction, true);
    };
  }, [args]);
}
