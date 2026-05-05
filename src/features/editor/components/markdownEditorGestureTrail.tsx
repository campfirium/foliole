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
  trail: { color: string; height: number; lineWidth: number; opacity: number; width: number } | null;
}) {
  if (!trail || !path) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20"
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
