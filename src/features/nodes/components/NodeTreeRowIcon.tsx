import { Leaf } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';

import { resolveNodeTreeRowCustomIcon } from './nodeIconSvgSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

interface NodeTreeRowIconProps {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}

function NodeTreeRowIconBadge({ state }: Pick<NodeTreeRowIconProps, 'state'>) {
  if (state === 'current') {
    return <span aria-hidden="true" className="absolute right-0 top-0 size-1 rounded-full bg-current" />;
  }
  if (state === 'done') {
    return (
      <span aria-hidden="true" className="absolute bottom-0 right-0 text-[7px] font-semibold leading-none text-current">
        ✓
      </span>
    );
  }
  return null;
}

export function NodeTreeRowIcon({ kind, state }: NodeTreeRowIconProps) {
  const isReviewCard = kind === 'review';
  const customIcon = resolveNodeTreeRowCustomIcon({ kind, state });
  return (
    <span
      className={cn('relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65', state === 'dismissed' && 'opacity-40')}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-source={customIcon.markup ? 'custom' : 'default'}
      data-node-icon-state={state}
      data-node-icon-mirror={customIcon.usesMirrorFallback ? 'fallback' : 'none'}
      data-node-icon-tone={state === 'dismissed' ? 'muted' : 'normal'}
      data-node-icon-variant={kind}
    >
      {customIcon.markup ? (
        <span
          className={cn(
            'inline-flex size-3.5 items-center justify-center [&_svg]:block',
            customIcon.usesMirrorFallback && '[transform:scaleY(-1)]'
          )}
          dangerouslySetInnerHTML={{ __html: customIcon.markup }}
        />
      ) : (
        <Leaf
          aria-hidden="true"
          className={cn('size-3.5', isReviewCard && '[transform:scaleY(-1)]')}
          strokeDasharray={state === 'queued' ? '2.2 1.4' : undefined}
          strokeWidth={1.75}
        />
      )}
      <NodeTreeRowIconBadge state={state} />
    </span>
  );
}
