import type { EditorMouseGestureDirection } from '../model/editorMouseGestures';
import type { EditorMouseGestureSettings } from '../model/editorMouseGestureSettings';

export interface GesturePoint {
  x: number;
  y: number;
}
export interface GestureTrackingState {
  directions: EditorMouseGestureDirection[];
  lastPoint: GesturePoint;
}
export interface GestureTrailState {
  color: string;
  height: number;
  lineWidth: number;
  opacity: number;
  points: GesturePoint[];
  width: number;
}

export function resolveDominantGestureDirection(
  deltaX: number,
  deltaY: number,
  segmentThresholdPx: number
): EditorMouseGestureDirection | null {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return Math.abs(deltaX) < segmentThresholdPx ? null : deltaX < 0 ? 'left' : 'right';
  }
  return Math.abs(deltaY) < segmentThresholdPx ? null : deltaY < 0 ? 'up' : 'down';
}

export function appendTrackedGestureDirection(
  tracking: GestureTrackingState,
  clientX: number,
  clientY: number,
  threshold: number
) {
  const direction = resolveDominantGestureDirection(
    clientX - tracking.lastPoint.x,
    clientY - tracking.lastPoint.y,
    threshold
  );
  if (!direction) return false;
  tracking.lastPoint = { x: clientX, y: clientY };
  if (tracking.directions.at(-1) !== direction && tracking.directions.length < 8) {
    tracking.directions.push(direction);
  }
  return true;
}

export function syncGestureTrail(
  host: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  settings: EditorMouseGestureSettings,
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>
) {
  if (!host || !settings.trailVisible) return;
  const rect = host.getBoundingClientRect();
  const point = { x: clientX - rect.left, y: clientY - rect.top };
  setTrail((current) => {
    const lastPoint = current?.points.at(-1);
    const points =
      !lastPoint ||
      Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= settings.trailPointThresholdPx
        ? [...(current?.points ?? []), point]
        : (current?.points ?? [point]);
    return {
      color: settings.trailColor,
      height: rect.height,
      lineWidth: settings.trailLineWidth,
      opacity: settings.trailOpacity,
      points,
      width: rect.width
    };
  });
}
