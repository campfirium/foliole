import { useRef, type MouseEvent, type PointerEvent } from 'react';

type TouchTap = { pointerId: number; startedAt: number; x: number; y: number };

export function useCompanionTouchClick(onActivate: () => void, options: {
  disabled?: boolean;
  ignoreTarget?: (target: EventTarget) => boolean;
  preserveSelection?: boolean;
} = {}) {
  const touch = useRef<TouchTap | null>(null);
  const compatibilityClickTarget = useRef<EventTarget | null>(null);

  const ignored = (target: EventTarget) => options.disabled || options.ignoreTarget?.(target);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    compatibilityClickTarget.current = null;
    touch.current = event.pointerType === 'touch' && event.isPrimary && !ignored(event.target)
      ? { pointerId: event.pointerId, startedAt: Date.now(), x: event.clientX, y: event.clientY }
      : null;
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const started = touch.current;
    if (started && Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8) touch.current = null;
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const started = touch.current;
    touch.current = null;
    if (!started || ignored(event.target) || started.pointerId !== event.pointerId || Date.now() - started.startedAt >= 500 ||
      Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8 ||
      (options.preserveSelection && window.getSelection()?.isCollapsed === false)) return;
    compatibilityClickTarget.current = event.currentTarget;
    onActivate();
  }

  function onPointerCancel() { touch.current = null; }

  function onClick(event: MouseEvent<HTMLElement>) {
    const handledTouchTarget = compatibilityClickTarget.current;
    compatibilityClickTarget.current = null;
    if (event.detail > 0 && handledTouchTarget === event.currentTarget) return;
    if (ignored(event.target)) return;
    onActivate();
  }

  return { onClick, onPointerDown, onPointerMove,
    onPointerUp, onPointerCancel };
}
