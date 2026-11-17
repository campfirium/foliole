import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

export function useCompanionImageLongPress<T>(resolve: (target: EventTarget, x: number, y: number) => T | null, open: (target: T) => void) {
  const gesture = useRef<{ pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancel = useCallback(() => {
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return { cancel, handlers: {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      cancel();
      if (!event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
      const value = resolve(event.target, event.clientX, event.clientY);
      if (!value) return;
      gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        timer: setTimeout(() => { cancel(); open(value); }, 500) };
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const started = gesture.current;
      if (started && (event.pointerId !== started.pointerId || Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8)) cancel();
    },
    onPointerUpCapture: cancel,
    onPointerCancelCapture: cancel,
    onContextMenuCapture(event: MouseEvent<HTMLElement>) {
      const value = resolve(event.target, event.clientX, event.clientY);
      if (!value) return;
      cancel();
      event.preventDefault();
      event.stopPropagation();
      open(value);
    }
  } };
}
