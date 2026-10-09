import { useRef, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from 'react';

import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';

type TouchTap = { pointerId: number; startedAt: number; target: EventTarget; x: number; y: number };

export function useImmersiveReadingSurfaceTap(
  editing: boolean,
  setVisible: Dispatch<SetStateAction<boolean>>
) {
  const touch = useRef<TouchTap | null>(null);
  const compatibilityClickTarget = useRef<EventTarget | null>(null);

  function handleSurfacePointerDown(event: PointerEvent<HTMLElement>) {
    compatibilityClickTarget.current = null;
    touch.current = !editing && event.pointerType === 'touch' && event.isPrimary &&
      !isCompanionArticleInteractiveTarget(event.target)
      ? { pointerId: event.pointerId, startedAt: Date.now(), target: event.target, x: event.clientX, y: event.clientY }
      : null;
  }

  function handleSurfacePointerMove(event: PointerEvent<HTMLElement>) {
    const started = touch.current;
    if (started && Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8) touch.current = null;
  }

  function handleSurfacePointerUp(event: PointerEvent<HTMLElement>) {
    const started = touch.current;
    touch.current = null;
    if (!started || editing || started.pointerId !== event.pointerId || Date.now() - started.startedAt >= 500 ||
      Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8 ||
      isCompanionArticleInteractiveTarget(event.target) || window.getSelection()?.isCollapsed === false) return;
    compatibilityClickTarget.current = started.target;
    setVisible((visible) => !visible);
  }

  function handleSurfacePointerCancel() { touch.current = null; }

  function handleSurfaceClick(event: MouseEvent<HTMLElement>) {
    const handledTouchTarget = compatibilityClickTarget.current;
    compatibilityClickTarget.current = null;
    if (event.detail > 0 && handledTouchTarget === event.target) return;
    if (isCompanionArticleInteractiveTarget(event.target)) return;
    setVisible((visible) => !visible);
  }

  return { handleSurfaceClick, handleSurfacePointerDown, handleSurfacePointerMove,
    handleSurfacePointerUp, handleSurfacePointerCancel };
}
