import type { CSSProperties, DragEvent as ReactDragEvent, ReactNode } from 'react';

import { cn } from '../../../shared/lib/utils';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../../shared/ui';

import './nodeTreeRowDropHint.css';

interface NodeTreeRowFrameProps {
  children: ReactNode;
  depth: number;
  dropIntent: 'before' | 'after' | 'child' | null;
  isDragDisabled: boolean;
  isDropTarget: boolean;
  label: string;
  nodeId: string;
  rowAction?: ReactNode;
  onDragEnd?: () => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragStart?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
}

function DropDestinationHint({ label }: { label: string }) {
  return (
    <AppTooltip open disableHoverableContent>
      <AppTooltipTrigger asChild>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" />
      </AppTooltipTrigger>
      <AppTooltipContent side="bottom" align="start" data-node-drop-hint hideWhenDetached>
        Move into “{label}”
      </AppTooltipContent>
    </AppTooltip>
  );
}

function RowDropIndicator({ intent }: { intent: NonNullable<NodeTreeRowFrameProps['dropIntent']> }) {
  if (intent === 'child') {
    return <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md border-2 border-[var(--role-accent)]" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute end-0 h-0.5 rounded-full bg-[var(--role-accent)]',
        'start-[calc(var(--folder-column-row-start,0.4rem)+var(--node-depth)*var(--folder-column-indent,1rem))]',
        intent === 'before' ? 'top-0' : 'bottom-0'
      )}
    />
  );
}

export function NodeTreeRowFrame(props: NodeTreeRowFrameProps) {
  const intent = props.isDropTarget ? props.dropIntent : null;
  return (
    <div
      className={cn('relative', intent === 'child' && 'rounded-md bg-[rgb(var(--role-accent-rgb)/0.12)]')}
      data-drop-intent={intent ?? undefined}
      style={{ '--node-depth': props.depth } as CSSProperties}
      draggable={!props.isDragDisabled}
      onDragEnd={props.onDragEnd ? (event) => (event.preventDefault(), props.onDragEnd?.()) : undefined}
      onDragEnter={props.onDragEnter ? (event) => props.onDragEnter?.(props.nodeId, event) : undefined}
      onDragLeave={props.onDragLeave ? (event) => props.onDragLeave?.(props.nodeId, event) : undefined}
      onDragOver={props.onDragOver ? (event) => props.onDragOver?.(props.nodeId, event) : undefined}
      onDragStart={props.onDragStart ? (event) => props.onDragStart?.(props.nodeId, event) : undefined}
      onDrop={props.onDrop ? (event) => props.onDrop?.(props.nodeId, event) : undefined}
    >
      {props.children}
      {props.rowAction ? (
        <div className="absolute right-1 top-1/2 -translate-y-1/2" data-node-row-action="true">
          {props.rowAction}
        </div>
      ) : null}
      {intent && <RowDropIndicator intent={intent} />}
      {intent === 'child' && <DropDestinationHint label={props.label} />}
    </div>
  );
}
