import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { EditorAdapter } from '../adapters/EditorAdapter';
import {
  resolveEditorMouseGesture,
  resolveEditorMouseGestureAction,
  type EditorMouseGestureBinding,
  type EditorMouseGestureDirection,
  type EditorMouseGestureId
} from '../model/editorMouseGestures';
import type { EditorMouseGestureSettings } from '../model/editorMouseGestureSettings';

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
  color: string;
  height: number;
  lineWidth: number;
  opacity: number;
  points: Point[];
  width: number;
}

interface WindowGestureHandlers {
  handleWindowMouseMove: (event: MouseEvent) => void;
  handleWindowMouseUp: (event: MouseEvent) => void;
}

function resolveDominantDirection(
  deltaX: number,
  deltaY: number,
  segmentThresholdPx: number
): EditorMouseGestureDirection | null {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    if (Math.abs(deltaX) < segmentThresholdPx) {
      return null;
    }
    return deltaX < 0 ? 'left' : 'right';
  }

  if (Math.abs(deltaY) < segmentThresholdPx) {
    return null;
  }
  return deltaY < 0 ? 'up' : 'down';
}

function canExtendGesture(directions: EditorMouseGestureDirection[]) {
  return directions.length === 1 && directions[0] === 'left';
}

function resolveGesturePreview(directions: EditorMouseGestureDirection[]): EditorMouseGestureId | null {
  if (canExtendGesture(directions)) {
    return null;
  }
  return resolveEditorMouseGesture(directions);
}

function createWindowGestureHandlers(
  adapterRef: React.MutableRefObject<EditorAdapter | null>,
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  settings: EditorMouseGestureSettings,
  trackingRef: React.MutableRefObject<GestureTrackingState | null>,
  suppressNextContextMenuRef: React.MutableRefObject<boolean>,
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>
): WindowGestureHandlers {
  const handleWindowMouseMove = (event: MouseEvent) => {
    const tracking = trackingRef.current;
    if (!tracking || (event.buttons & 2) !== 2) {
      return;
    }

    const direction = resolveDominantDirection(
      event.clientX - tracking.lastPoint.x,
      event.clientY - tracking.lastPoint.y,
      settings.segmentThresholdPx
    );
    if (!direction) {
      return;
    }

    event.preventDefault();
    tracking.lastPoint = { x: event.clientX, y: event.clientY };
    syncTrail(hostRef.current, event.clientX, event.clientY, settings, setTrail);
    if (tracking.directions.at(-1) === direction || tracking.directions.length >= 2) {
      return;
    }
    tracking.directions.push(direction);
    if (resolveGesturePreview(tracking.directions)) {
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
  settings: EditorMouseGestureSettings,
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>
) {
  if (!host) {
    return;
  }

  const { point, rect } = toRelativePoint(host, clientX, clientY);
  setTrail((current) => {
    if (!current) {
      return {
        color: settings.trailColor,
        height: rect.height,
        lineWidth: settings.trailLineWidth,
        opacity: settings.trailOpacity,
        points: [point],
        width: rect.width
      };
    }

    const lastPoint = current.points.at(-1);
    if (!lastPoint) {
      return {
        color: settings.trailColor,
        height: rect.height,
        lineWidth: settings.trailLineWidth,
        opacity: settings.trailOpacity,
        points: [point],
        width: rect.width
      };
    }

    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    if (distance < settings.trailPointThresholdPx) {
      return {
        ...current,
        color: settings.trailColor,
        lineWidth: settings.trailLineWidth,
        opacity: settings.trailOpacity
      };
    }

    return {
      color: settings.trailColor,
      height: rect.height,
      lineWidth: settings.trailLineWidth,
      opacity: settings.trailOpacity,
      points: [...current.points, point],
      width: rect.width
    };
  });
}

export function useEditorMouseGesture(
  adapterRef: React.MutableRefObject<EditorAdapter | null>,
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  settings: EditorMouseGestureSettings
) {
  const trackingRef = useRef<GestureTrackingState | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const [trail, setTrail] = useState<GestureTrailState | null>(null);

  useEffect(() => {
    const { handleWindowMouseMove, handleWindowMouseUp } = createWindowGestureHandlers(
      adapterRef,
      hostRef,
      bindings,
      settings,
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
  }, [adapterRef, bindings, hostRef, settings]);

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !bindings.length) {
      return;
    }

    trackingRef.current = {
      directions: [],
      lastPoint: { x: event.clientX, y: event.clientY }
    };
    suppressNextContextMenuRef.current = false;
    syncTrail(hostRef.current, event.clientX, event.clientY, settings, setTrail);
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
