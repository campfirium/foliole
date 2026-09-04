export function buildGestureTrailPath(points: { x: number; y: number }[]) {
  if (points.length < 2) {
    return '';
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function GestureTrailOverlay({
  path,
  trail
}: {
  path: string;
  trail: {
    color: string;
    height: number;
    lineWidth: number;
    opacity: number;
    width: number;
  } | null;
}) {
  if (!trail || !path) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-surface-overlay"
      height={trail.height}
      viewBox={`0 0 ${trail.width} ${trail.height}`}
      width={trail.width}
    >
      <path
        d={path}
        data-editor-gesture-trail="true"
        fill="none"
        stroke={trail.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={trail.opacity}
        strokeWidth={trail.lineWidth}
      />
    </svg>
  );
}

const DIRECTION_SYMBOLS = { down: '↓', left: '←', right: '→', up: '↑' } as const;

export function GestureDirectionHintOverlay({
  commandTitle,
  directions,
  position
}: {
  commandTitle: string | null;
  directions: Array<keyof typeof DIRECTION_SYMBOLS>;
  position: { x: number; y: number } | null;
}) {
  const t = useTranslation();
  if (!directions.length || !position) return null;
  const directionLabel = directions.map((direction) => DIRECTION_SYMBOLS[direction]).join('');
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-surface-overlay ml-3 mt-3 flex select-none items-baseline gap-2 whitespace-nowrap text-ui-sm font-medium text-foreground/55"
      data-editor-gesture-hint="true"
      style={{ left: position.x, top: position.y } as CSSProperties}
    >
      <span className="font-semibold text-foreground/70">{directionLabel}</span>
      <span>{commandTitle ?? t('settings.mouseGestures.bindings.unbound')}</span>
    </div>
  );
}
import type { CSSProperties } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
