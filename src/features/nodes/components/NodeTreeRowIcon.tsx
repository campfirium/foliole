import { cn } from '../../../shared/lib/utils';

import { getNodeIconStateAppearance } from './nodeIconAppearanceSettings';
import { resolveNodeTreeRowCustomIcon } from './nodeIconSvgSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { NodeTreeRowPresetIcon, resolveNodeIconPresetTransformMode } from './NodeTreeRowPresetIcon';

interface NodeTreeRowIconProps {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}

function iconTransformClass(transformMode: 'none' | 'flip-x' | 'flip-y') {
  if (transformMode === 'flip-x') {
    return '[transform:scaleX(-1)]';
  }
  if (transformMode === 'flip-y') {
    return '[transform:scaleY(-1)]';
  }
  return '';
}

function resolveCustomIconClassName(transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'inline-flex size-3.5 items-center justify-center',
    iconTransformClass(transformMode)
  );
}

function resolveDefaultIconClassName(transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'size-3.5',
    iconTransformClass(transformMode)
  );
}

export function NodeTreeRowIcon({ kind, state }: NodeTreeRowIconProps) {
  const stateAppearance = getNodeIconStateAppearance(state);
  const customIcon = resolveNodeTreeRowCustomIcon({ kind, state });
  const fallbackShape = kind === 'review' ? 'diamond' : 'hexagon';
  const fallbackTransformMode = resolveNodeIconPresetTransformMode(kind, fallbackShape);
  const transformMode = customIcon.markup ? customIcon.transformMode : fallbackTransformMode;
  const pattern = stateAppearance.strokeStyle === 'dashed' ? 'dash' : 'normal';
  const iconStyle = {
    color: stateAppearance.color,
    opacity: stateAppearance.fadeEnabled && !stateAppearance.fadeWholeRow ? stateAppearance.fadeOpacity : 1,
    ['--node-icon-dash-length' as const]: String(stateAppearance.dashLength),
    ['--node-icon-gap-length' as const]: String(stateAppearance.gapLength),
    ['--node-icon-stroke-width' as const]: String(stateAppearance.lineWidth)
  };
  const iconClassName = cn(
    'relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65'
  );
  return (
    <span
      className={iconClassName}
      style={iconStyle}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-pattern={pattern}
      data-node-icon-shape={fallbackShape}
      data-node-icon-source={customIcon.markup ? 'custom' : 'default'}
      data-node-icon-state={state}
      data-node-icon-stroke-style={stateAppearance.strokeStyle}
      data-node-icon-mirror={transformMode}
      data-node-icon-tone="normal"
      data-node-icon-variant={kind}
    >
      {customIcon.markup ? (
        <span
          className={resolveCustomIconClassName(transformMode)}
          dangerouslySetInnerHTML={{ __html: customIcon.markup }}
        />
      ) : (
        <span className={resolveDefaultIconClassName(transformMode)}>
          <NodeTreeRowPresetIcon shape={fallbackShape} />
        </span>
      )}
    </span>
  );
}
