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
    'inline-flex size-3.5 items-center justify-center',
    iconTransformClass(transformMode)
  );
}

function resolveDefaultIconClassName(state: NodeTreeRowIconState, transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'size-3.5',
    state === 'pending' && '[&_path]:stroke-[2.15] [&_path]:[stroke-dasharray:2.4_1.4] [&_path]:[stroke-linecap:butt]',
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
    state === 'pending' && 'text-foreground/78'
  );
  return (
    <span
      className={iconClassName}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-pattern={state === 'pending' ? 'dash' : 'normal'}
      data-node-icon-source={customIcon.markup ? 'custom' : 'default'}
      data-node-icon-state={state}
      data-node-icon-mirror={transformMode}
      data-node-icon-tone="normal"
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
