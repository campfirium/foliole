import { Leaf } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';

import { resolveNodeTreeRowCustomIcon } from './nodeIconSvgSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

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

function resolveCustomIconClassName(state: NodeTreeRowIconState, transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'inline-flex size-3.5 items-center justify-center [&_circle]:stroke-current [&_ellipse]:stroke-current [&_line]:stroke-current [&_path]:stroke-current [&_polygon]:stroke-current [&_polyline]:stroke-current [&_rect]:stroke-current [&_svg]:block [&_svg]:overflow-visible',
    state !== 'dismissed' &&
      '[&_circle]:[stroke-linecap:round] [&_ellipse]:[stroke-linecap:round] [&_line]:[stroke-linecap:round] [&_path]:[stroke-linecap:round] [&_polygon]:[stroke-linecap:round] [&_polyline]:[stroke-linecap:round] [&_rect]:[stroke-linecap:round]',
    state === 'pending' &&
      '[&_circle]:[stroke-dasharray:3.2_1.6] [&_ellipse]:[stroke-dasharray:3.2_1.6] [&_line]:[stroke-dasharray:3.2_1.6] [&_path]:[stroke-dasharray:3.2_1.6] [&_polygon]:[stroke-dasharray:3.2_1.6] [&_polyline]:[stroke-dasharray:3.2_1.6] [&_rect]:[stroke-dasharray:3.2_1.6]',
    state === 'active' &&
      '[&_circle]:[stroke-dasharray:1_1.4_4.6_1.4] [&_ellipse]:[stroke-dasharray:1_1.4_4.6_1.4] [&_line]:[stroke-dasharray:1_1.4_4.6_1.4] [&_path]:[stroke-dasharray:1_1.4_4.6_1.4] [&_polygon]:[stroke-dasharray:1_1.4_4.6_1.4] [&_polyline]:[stroke-dasharray:1_1.4_4.6_1.4] [&_rect]:[stroke-dasharray:1_1.4_4.6_1.4]',
    iconTransformClass(transformMode)
  );
}

function resolveDefaultIconClassName(state: NodeTreeRowIconState, transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'size-3.5 [&_path]:[stroke-linecap:round] [&_path]:[stroke-linejoin:round]',
    state === 'pending' && '[&_path]:[stroke-dasharray:3.2_1.6]',
    state === 'active' && '[&_path]:[stroke-dasharray:1_1.4_4.6_1.4]',
    iconTransformClass(transformMode)
  );
}

export function NodeTreeRowIcon({ kind, state }: NodeTreeRowIconProps) {
  const isReviewCard = kind === 'review';
  const customIcon = resolveNodeTreeRowCustomIcon({ kind, state });
  const fallbackTransformMode = isReviewCard ? 'flip-y' : 'none';
  const transformMode = customIcon.markup ? customIcon.transformMode : fallbackTransformMode;
  const iconClassName = cn(
    'relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65',
    state === 'pending' && 'text-foreground/78',
    state === 'active' && 'text-foreground/92',
    state === 'dismissed' && 'opacity-28'
  );
  return (
    <span
      className={iconClassName}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-pattern={state === 'dismissed' ? 'faded' : state === 'active' ? 'dot-dash' : 'dash'}
      data-node-icon-source={customIcon.markup ? 'custom' : 'default'}
      data-node-icon-state={state}
      data-node-icon-mirror={transformMode}
      data-node-icon-tone={state === 'dismissed' ? 'muted' : 'normal'}
      data-node-icon-variant={kind}
    >
      {customIcon.markup ? (
        <span
          className={resolveCustomIconClassName(state, transformMode)}
          dangerouslySetInnerHTML={{ __html: customIcon.markup }}
        />
      ) : (
        <Leaf
          aria-hidden="true"
          className={resolveDefaultIconClassName(state, transformMode)}
          strokeWidth={2}
        />
      )}
    </span>
  );
}
