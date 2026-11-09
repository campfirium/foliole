import type { DragEvent as ReactDragEvent, ReactNode } from 'react';

import { cn } from '../../../shared/lib/utils';

interface NodeTreeRowFrameProps {
  children: ReactNode;
  dropIntent: 'before' | 'after' | 'child' | null;
  isDragDisabled: boolean;
  isDropTarget: boolean;
  nodeId: string;
  rowAction?: ReactNode;
  onDragEnd?: () => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragStart?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
}

function resolveNodeRowFrameClassName(isDropTarget: boolean, dropIntent: NodeTreeRowFrameProps['dropIntent']) {
  return cn(
    'relative',
    isDropTarget && dropIntent === 'child' && 'outline outline-1 -outline-offset-1 outline-border-strong bg-foreground/[0.06]',
    isDropTarget && (dropIntent === 'before' || dropIntent === 'after') &&
      'after:pointer-events-none after:absolute after:inset-x-0 after:h-0.5 after:bg-border-strong',
    isDropTarget && dropIntent === 'before' && 'after:top-0',
    isDropTarget && dropIntent === 'after' && 'after:bottom-0'
  );
}

export function NodeTreeRowFrame(props: NodeTreeRowFrameProps) {
  return (
    <div
      className={resolveNodeRowFrameClassName(props.isDropTarget, props.dropIntent)}
      data-drop-intent={props.isDropTarget ? props.dropIntent : undefined}
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
    </div>
  );
}
