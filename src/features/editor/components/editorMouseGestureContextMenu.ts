import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

interface GestureContextInteraction {
  gestureIntent: boolean;
  pendingContextMenu: {
    event: ReactMouseEvent<HTMLDivElement>;
    open: (event: ReactMouseEvent<HTMLDivElement>) => void;
  } | null;
}

export function arbitrateEditorGestureContextMenu(
  event: ReactMouseEvent<HTMLDivElement>,
  onContextMenu: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined,
  enabled: boolean,
  suppressNextContextMenuRef: MutableRefObject<boolean>,
  trackingRef: MutableRefObject<GestureContextInteraction | null>
) {
  if (!enabled) {
    onContextMenu?.(event);
    return;
  }
  if (suppressNextContextMenuRef.current) {
    suppressNextContextMenuRef.current = false;
    event.preventDefault();
    return;
  }
  const tracking = trackingRef.current;
  if (!tracking) {
    onContextMenu?.(event);
    return;
  }
  event.preventDefault();
  if (!tracking.gestureIntent && onContextMenu) {
    tracking.pendingContextMenu = { event, open: onContextMenu };
  }
}
