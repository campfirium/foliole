import { Diamond, Hexagon } from 'lucide-react';

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
    iconTransformClass(transformMode)
  );
}

export function NodeTreeRowIcon({ kind, state }: NodeTreeRowIconProps) {
  const isReviewCard = kind === 'review';
  const customIcon = resolveNodeTreeRowCustomIcon({ kind, state });
  const fallbackTransformMode = 'none';
  const transformMode = customIcon.markup ? customIcon.transformMode : fallbackTransformMode;
  const iconStyle = state === 'scheduled' ? { color: 'var(--app-accent-color)' } : undefined;
  const iconClassName = cn(
    'relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65'
  );
  const DefaultIcon = isReviewCard ? Diamond : Hexagon;
  return (
    <span
      className={iconClassName}
      style={iconStyle}
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
        <DefaultIcon
          aria-hidden="true"
          className={resolveDefaultIconClassName(state, transformMode)}
          strokeWidth={2}
        />
      )}
    </span>
  );
}
