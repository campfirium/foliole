import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { EditorAdapter } from '../adapters/EditorAdapter';
import {
  resolveEditorMouseGesture,
  resolveEditorMouseGestureAction,
  type EditorMouseGestureBinding,
  type EditorMouseGestureDirection
} from '../model/editorMouseGestures';

import { runEditorMouseGestureAction } from './editorMouseGestureActions';

interface Point {
  x: number;
  y: number;
}

interface GestureTrackingState {
  directions: EditorMouseGestureDirection[];
  lastPoint: Point;
}

interface GestureTrailState {
  height: number;
  points: Point[];
  width: number;
}

const SEGMENT_THRESHOLD_PX = 18;
const TRAIL_POINT_THRESHOLD_PX = 6;

interface WindowGestureHandlers {
  handleWindowMouseMove: (event: MouseEvent) => void;
  handleWindowMouseUp: (event: MouseEvent) => void;
}

function resolveDominantDirection(deltaX: number, deltaY: number): EditorMouseGestureDirection | null {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    if (Math.abs(deltaX) < SEGMENT_THRESHOLD_PX) {
      return null;
    }
    return deltaX < 0 ? 'left' : 'right';
  }

  if (Math.abs(deltaY) < SEGMENT_THRESHOLD_PX) {
    return null;
  }
  return deltaY < 0 ? 'up' : 'down';
}

function createWindowGestureHandlers(
  adapterRef: React.MutableRefObject<EditorAdapter | null>,
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  trackingRef: React.MutableRefObject<GestureTrackingState | null>,
  suppressNextContextMenuRef: React.MutableRefObject<boolean>,
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>
): WindowGestureHandlers {
  const handleWindowMouseMove = (event: MouseEvent) => {
    const tracking = trackingRef.current;
    if (!tracking || (event.buttons & 2) !== 2) {
      return;
    }

    const direction = resolveDominantDirection(event.clientX - tracking.lastPoint.x, event.clientY - tracking.lastPoint.y);
    if (!direction) {
      return;
    }

    event.preventDefault();
    tracking.lastPoint = { x: event.clientX, y: event.clientY };
    syncTrail(hostRef.current, event.clientX, event.clientY, setTrail);
    if (tracking.directions.at(-1) === direction || tracking.directions.length >= 2) {
      return;
    }
    tracking.directions.push(direction);
    if (resolveEditorMouseGesture(tracking.directions)) {
      suppressNextContextMenuRef.current = true;
    }
  };

  const handleWindowMouseUp = (event: MouseEvent) => {
    if (event.button !== 2) {
      return;
    }

    const tracking = trackingRef.current;
    trackingRef.current = null;
    setTrail(null);
    if (!tracking) {
      return;
    }

    const gesture = resolveEditorMouseGesture(tracking.directions);
    const action = resolveEditorMouseGestureAction(bindings, gesture);
    if (!action) {
      return;
    }

    event.preventDefault();
    suppressNextContextMenuRef.current = runEditorMouseGestureAction(adapterRef.current, action);
  };

  return {
    handleWindowMouseMove,
    handleWindowMouseUp
  };
}

function toRelativePoint(host: HTMLDivElement, clientX: number, clientY: number) {
  const rect = host.getBoundingClientRect();
  return {
    point: {
      x: clientX - rect.left,
      y: clientY - rect.top
    },
    rect
  };
}

function syncTrail(
  host: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>
) {
  if (!host) {
    return;
  }

  const { point, rect } = toRelativePoint(host, clientX, clientY);
  setTrail((current) => {
    if (!current) {
      return { height: rect.height, points: [point], width: rect.width };
    }

    const lastPoint = current.points.at(-1);
    if (!lastPoint) {
      return { height: rect.height, points: [point], width: rect.width };
    }

    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    if (distance < TRAIL_POINT_THRESHOLD_PX) {
      return current;
    }

    return {
      height: rect.height,
      points: [...current.points, point],
      width: rect.width
    };
  });
}

export function useEditorMouseGesture(
  adapterRef: React.MutableRefObject<EditorAdapter | null>,
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[]
) {
  const trackingRef = useRef<GestureTrackingState | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const [trail, setTrail] = useState<GestureTrailState | null>(null);

  useEffect(() => {
    const { handleWindowMouseMove, handleWindowMouseUp } = createWindowGestureHandlers(
      adapterRef,
      hostRef,
      bindings,
      trackingRef,
      suppressNextContextMenuRef,
      setTrail
    );

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [adapterRef, bindings, hostRef]);

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !bindings.length) {
      return;
    }

    trackingRef.current = {
      directions: [],
      lastPoint: { x: event.clientX, y: event.clientY }
    };
    suppressNextContextMenuRef.current = false;
    syncTrail(hostRef.current, event.clientX, event.clientY, setTrail);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>, onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void) => {
    if (suppressNextContextMenuRef.current) {
      suppressNextContextMenuRef.current = false;
      event.preventDefault();
      return;
    }

    onContextMenu?.(event);
  };

  return {
    handleContextMenu,
    handleMouseDownCapture,
    trail
  };
}
