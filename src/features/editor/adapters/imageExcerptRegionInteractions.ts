import {
  cancelImageExcerptRegionSelection,
  finishImageExcerptRegionSelection,
  IMAGE_EXCERPT_SELECTION_MODE_EVENT,
  registerImageExcerptSelectionSurface,
  type ImageExcerptRegionRect
} from '../model/imageExcerptRegionSelection';

import { toRelativeImagePoint } from './imageClozeWidgetInteractionHelpers';

type DragState = { pointerId: number; start: { x: number; y: number } };
type InteractionState = { active: boolean; drag: DragState | null };
type InteractionArgs = {
  attachmentId: string;
  draftRectElement: HTMLElement;
  editorNodeId: string;
  from: number;
  getImageRange: () => { from: number; to: number };
  image: HTMLImageElement;
  overlay: HTMLElement;
  surface: HTMLElement;
  to: number;
};
const cleanupBySurface = new WeakMap<HTMLElement, () => void>();

function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): ImageExcerptRegionRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { height: Math.abs(end.y - start.y), width: Math.abs(end.x - start.x), x, y };
}

function updateDraft(element: HTMLElement, rect: ImageExcerptRegionRect | null) {
  element.hidden = !rect;
  if (!rect) return;
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
}

function createModeHandlers(args: InteractionArgs, state: InteractionState) {
  const setActive = (next: boolean) => {
    state.active = next;
    state.drag = null;
    args.surface.dataset.mdImageExcerptActive = String(next);
    args.overlay.dataset.mdImageCreateMode = String(next);
    args.overlay.hidden = !next;
    updateDraft(args.draftRectElement, null);
  };
  const onMode = (event: Event) => setActive((event as CustomEvent<string | null>).detail === args.editorNodeId);
  const onKeyDown = (event: KeyboardEvent) => {
    if (state.active && event.key === 'Escape') cancelImageExcerptRegionSelection();
  };
  return { onKeyDown, onMode };
}

function createPointerHandlers(args: InteractionArgs, state: InteractionState) {
  const onPointerDown = (event: PointerEvent) => {
    if (!state.active || event.button !== 0 || event.isPrimary === false || event.target instanceof Element && event.target.closest('button')) return;
    const point = toRelativeImagePoint(args.overlay, event);
    if (!point) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.drag = { pointerId: event.pointerId, start: point };
    args.surface.setPointerCapture(event.pointerId);
    updateDraft(args.draftRectElement, { height: 0, width: 0, x: point.x, y: point.y });
  };
  const onPointerMove = (event: PointerEvent) => {
    const drag = state.drag;
    if (!state.active || !drag || drag.pointerId !== event.pointerId) return;
    const point = toRelativeImagePoint(args.overlay, event);
    if (!point) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateDraft(args.draftRectElement, rectFromPoints(drag.start, point));
  };
  const onPointerUp = (event: PointerEvent) => {
    const drag = state.drag;
    if (!state.active || !drag || drag.pointerId !== event.pointerId) return;
    const point = toRelativeImagePoint(args.overlay, event);
    const currentDrag = drag;
    state.drag = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (args.surface.hasPointerCapture(event.pointerId)) args.surface.releasePointerCapture(event.pointerId);
    if (!point) return updateDraft(args.draftRectElement, null);
    const rect = rectFromPoints(currentDrag.start, point);
    const bounds = args.overlay.getBoundingClientRect();
    if (rect.width * bounds.width < 8 || rect.height * bounds.height < 8) {
      updateDraft(args.draftRectElement, null);
      return;
    }
    finishImageExcerptRegionSelection({
      attachmentId: args.attachmentId,
      image: args.image,
      imageRange: args.getImageRange() ?? { from: args.from, to: args.to },
      left: event.clientX,
      rect,
      top: event.clientY
    });
  };
  return { onPointerDown, onPointerMove, onPointerUp };
}

export function attachImageExcerptRegionInteractions(args: InteractionArgs) {
  const state: InteractionState = { active: false, drag: null };
  const unregister = registerImageExcerptSelectionSurface(args.editorNodeId);
  const mode = createModeHandlers(args, state);
  const pointer = createPointerHandlers(args, state);
  window.addEventListener(IMAGE_EXCERPT_SELECTION_MODE_EVENT, mode.onMode);
  window.addEventListener('keydown', mode.onKeyDown, true);
  args.surface.addEventListener('pointerdown', pointer.onPointerDown, true);
  args.surface.addEventListener('pointermove', pointer.onPointerMove, true);
  args.surface.addEventListener('pointerup', pointer.onPointerUp, true);
  const cleanup = () => {
    unregister();
    window.removeEventListener(IMAGE_EXCERPT_SELECTION_MODE_EVENT, mode.onMode);
    window.removeEventListener('keydown', mode.onKeyDown, true);
    args.surface.removeEventListener('pointerdown', pointer.onPointerDown, true);
    args.surface.removeEventListener('pointermove', pointer.onPointerMove, true);
    args.surface.removeEventListener('pointerup', pointer.onPointerUp, true);
  };
  cleanupBySurface.set(args.surface, cleanup);
  return cleanup;
}

export function disposeImageExcerptRegionInteractions(surface: HTMLElement) {
  cleanupBySurface.get(surface)?.();
  cleanupBySurface.delete(surface);
}
