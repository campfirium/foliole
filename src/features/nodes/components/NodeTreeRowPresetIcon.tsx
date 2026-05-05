import type { NodeIconShape } from './nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind } from './NodeTreeRowIconModel';

interface NodeTreeRowPresetIconProps {
  doubleLineDistance?: number;
  effect?: 'none' | 'double-line';
  preview?: boolean;
  shape: NodeIconShape;
}

export function resolveNodeIconPresetTransformMode(kind: NodeTreeRowIconKind, shape: NodeIconShape) {
  return kind === 'review' && shape === 'leaf' ? 'flip-x' : 'none';
}

function ShapePath(props: { shape: NodeIconShape }) {
  switch (props.shape) {
    case 'circle':
      return <circle cx="8" cy="8" fill="none" r="4.7" />;
    case 'square':
      return <rect fill="none" height="9.4" rx="1.5" width="9.4" x="3.3" y="3.3" />;
    case 'triangle':
      return <polygon fill="none" points="8,3 13,12 3,12" />;
    case 'diamond':
      return <polygon fill="none" points="8,2.8 13.2,8 8,13.2 2.8,8" />;
    case 'leaf':
      return <path d="M3.2 10.8C3.4 6.3 6.8 3.1 12.4 2.9C12.2 8.6 9.3 12.5 4.4 12.8M4.4 12.8L7.2 9.9" fill="none" />;
    case 'hexagon':
    default:
      return <polygon fill="none" points="8,2.2 13.1,5.1 13.1,10.9 8,13.8 2.9,10.9 2.9,5.1" />;
  }
}

function doubleLineScale(distance: number) {
  return Math.max(0.5, Math.min(0.96, 1 - distance / 16));
}

export function NodeTreeRowPresetIcon({ doubleLineDistance = 2, effect = 'none', preview = false, shape }: NodeTreeRowPresetIconProps) {
  const innerScale = doubleLineScale(doubleLineDistance);
  return (
    <svg
      aria-hidden="true"
      className={preview ? 'size-6' : 'size-3.5'}
      data-node-icon-shape={shape}
      fill="none"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 16 16"
    >
      <ShapePath shape={shape} />
      {effect === 'double-line' ? (
        <g data-node-icon-effect="double-line-inner" transform={`translate(8 8) scale(${innerScale}) translate(-8 -8)`}>
          <ShapePath shape={shape} />
        </g>
      ) : null}
    </svg>
  );
}
