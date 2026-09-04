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
  directions
}: {
  directions: Array<keyof typeof DIRECTION_SYMBOLS>;
}) {
  if (!directions.length) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-4 top-4 z-surface-overlay rounded-md border border-border bg-elevated px-2 py-1 text-ui-md text-foreground shadow-popover"
      data-editor-gesture-hint="true"
    >
      {directions.map((direction) => DIRECTION_SYMBOLS[direction]).join(' ')}
    </div>
  );
}
