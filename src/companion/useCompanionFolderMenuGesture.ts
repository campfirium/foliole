import { useCallback, useEffect, useRef, type HTMLAttributes } from 'react';

const holdDuration = 500;
const movementTolerance = 8;

export function useCompanionFolderMenuGesture(open: (() => void) | null): HTMLAttributes<HTMLButtonElement> {
  const press = useRef<{ pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const consumed = useRef(false);
  const cancel = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => cancel, [cancel, open]);
  if (!open) return {};

  return {
    onPointerDown(event) {
      cancel();
      if (!event.isPrimary || event.button !== 0) return;
      consumed.current = false;
      press.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          cancel();
          consumed.current = true;
          open();
        }, holdDuration)
      };
    },
    onPointerMove(event) {
      const start = press.current;
      if (start?.pointerId === event.pointerId &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > movementTolerance) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onTouchEndCapture(event) {
      // The sheet can cover the row before release, sending the generated click to its backdrop.
      if (consumed.current) event.preventDefault();
    },
    onContextMenu(event) {
      event.preventDefault();
      if (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') return;
      cancel();
      open();
    },
    onKeyDown(event) {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      open();
    },
    onClickCapture(event) {
      if (event.detail === 0 || !consumed.current) return;
      event.preventDefault();
      event.stopPropagation();
    }
  };
}
