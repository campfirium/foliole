import { resolvePdfSelectionClientRects } from './pdfSelectionClientRects';

const TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET = 22;
const TOOLBAR_WIDTH = 118;
const TOOLBAR_HEIGHT = 42;
const GAP = 4;
const MARGIN = 8;

function distanceToRect(rect: DOMRect, event: MouseEvent) {
  const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
  const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
  return dx * dx + dy * dy;
}

function resolveAnchorRect(selection: Selection, event: MouseEvent | KeyboardEvent) {
  const range = selection.getRangeAt(0);
  const rects = resolvePdfSelectionClientRects(range).filter(rect =>
    rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight &&
    rect.right > 0 && rect.left < window.innerWidth);
  if (event instanceof MouseEvent) {
    return rects.reduce<DOMRect | undefined>((nearest, rect) =>
      !nearest || distanceToRect(rect, event) < distanceToRect(nearest, event) ? rect : nearest, undefined);
  }
  const focusAtStart = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
  return focusAtStart ? rects[0] : rects.at(-1);
}

export function resolvePdfSelectionToolbarPosition(event: MouseEvent | KeyboardEvent) {
  const selection = window.getSelection();
  const rect = selection && selection.rangeCount > 0 ? resolveAnchorRect(selection, event) : undefined;
  const pointer = event instanceof MouseEvent ? event : null;
  const anchorX = rect
    ? Math.max(rect.left, Math.min(pointer?.clientX ?? rect.left + rect.width / 2, rect.right))
    : pointer?.clientX ?? MARGIN + TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET;
  const anchorTop = rect?.top ?? pointer?.clientY ?? MARGIN + TOOLBAR_HEIGHT + GAP;
  const above = anchorTop - TOOLBAR_HEIGHT - GAP;
  const top = above >= MARGIN ? above : (rect?.bottom ?? anchorTop) + GAP;
  return {
    left: Math.max(MARGIN, Math.min(anchorX - TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET, window.innerWidth - TOOLBAR_WIDTH - MARGIN)),
    top: Math.max(MARGIN, Math.min(top, window.innerHeight - TOOLBAR_HEIGHT - MARGIN))
  };
}
