import type { DragEvent as ReactDragEvent, ReactNode } from 'react';

import { cn } from '../../../shared/lib/utils';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../../shared/ui';

interface NodeTreeRowFrameProps {
  children: ReactNode;
  dropIntent: 'before' | 'after' | 'child' | null;
  isDragDisabled: boolean;
  isDropTarget: boolean;
  nodeId: string;
  onDragEnd?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragStart?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
}

function resolveNodeRowFrameClassName(isDropTarget: boolean, dropIntent: NodeTreeRowFrameProps['dropIntent']) {
  return cn(
    isDropTarget && dropIntent === 'child' && 'border border-border-strong bg-foreground/[0.06]',
    isDropTarget && dropIntent === 'before' && 'border-t-2 border-border-strong',
    isDropTarget && dropIntent === 'after' && 'border-b-2 border-border-strong'
  );
}

export function NodeTreeRowFrame(props: NodeTreeRowFrameProps) {
  const frame = (
    <div
      className={resolveNodeRowFrameClassName(props.isDropTarget, props.dropIntent)}
      draggable={!props.isDragDisabled}
      onDragEnd={props.onDragEnd}
      onDragEnter={props.onDragEnter ? (event) => props.onDragEnter?.(props.nodeId, event) : undefined}
      onDragOver={props.onDragOver ? (event) => props.onDragOver?.(props.nodeId, event) : undefined}
      onDragStart={props.onDragStart ? (event) => props.onDragStart?.(props.nodeId, event) : undefined}
      onDrop={props.onDrop ? (event) => props.onDrop?.(props.nodeId, event) : undefined}
    >
      {props.children}
    </div>
  );

  if (!props.isDragDisabled) {
    return frame;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{frame}</AppTooltipTrigger>
      <AppTooltipContent>Derived nodes cannot be moved.</AppTooltipContent>
    </AppTooltip>
  );
}
