import type { MouseEvent, PointerEvent, TouchEvent } from 'react';

import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';
import type { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import type { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

export function createArticleToolbarEvents(
  toolbar: ReturnType<typeof useCompanionSelectionAnnotationToolbar>,
  reading: ReturnType<typeof useImmersiveReadableArticleState>
) {
  function closeToolbarFromArticlePointer(event: PointerEvent<HTMLElement>) {
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticleTouch(event: TouchEvent<HTMLElement>) {
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.closeSelectionToolbar();
  }
  function openToolbarFromArticlePointer(event: PointerEvent<HTMLElement>) {
    reading.handleSurfacePointerUp(event);
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.openSelectionToolbar(event);
  }
  function handleSurfacePointerDown(event: PointerEvent<HTMLElement>) {
    reading.handleSurfacePointerDown(event);
    closeToolbarFromArticlePointer(event);
  }
  function handleSurfacePointerMove(event: PointerEvent<HTMLElement>) {
    reading.handleSurfacePointerMove(event);
    closeToolbarFromArticlePointer(event);
  }
  function handleSurfaceClick(event: MouseEvent<HTMLElement>) {
    reading.handleSurfaceClick(event);
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.openSelectionToolbar(event);
  }
  return { handleSurfaceClick, handleSurfacePointerDown, handleSurfacePointerMove, closeToolbarFromArticleTouch, openToolbarFromArticlePointer };
}
