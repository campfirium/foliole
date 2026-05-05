import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import { cn } from '../../../lib/utils';
import { AppButton } from '../../../shared/ui';

interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  isDragDisabled?: boolean;
  isDropTarget?: boolean;
  label: string;
  nodeId: string;
  onDragEnd?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragStart?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleCollapse: (nodeId: string) => void;
}

export function NodeTreeRow({
  depth,
  isActive,
  isCollapsed,
  isSelected,
  hasChildren,
  isDragDisabled = false,
  isDropTarget = false,
  label,
  nodeId,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDragStart,
  onDrop,
  onContextMenu,
  onSelect,
  onToggleCollapse
}: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <div
      className={cn(isDropTarget && 'border border-border-strong bg-foreground/[0.06]')}
      draggable={!isDragDisabled}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter ? (event) => onDragEnter(nodeId, event) : undefined}
      onDragOver={onDragOver ? (event) => onDragOver(nodeId, event) : undefined}
      onDragStart={onDragStart ? (event) => onDragStart(nodeId, event) : undefined}
      onDrop={onDrop ? (event) => onDrop(nodeId, event) : undefined}
      title={isDragDisabled ? 'Derived nodes cannot be moved.' : undefined}
    >
      <AppButton
        active={isSelected}
        aria-current={isActive ? 'page' : undefined}
        aria-pressed={isSelected}
        className="gap-2 pl-[calc(0.5rem+var(--node-depth,0)*1rem)] pr-4"
        onContextMenu={onContextMenu ? (event) => onContextMenu(nodeId, event) : undefined}
        onClick={(event) => onSelect(nodeId, event)}
        style={style}
        variant="list"
      >
        <NodeTreeRowExpandToggle
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          label={label}
          nodeId={nodeId}
          onToggleCollapse={onToggleCollapse}
        />
        <span className="min-w-0 truncate">{label}</span>
      </AppButton>
    </div>
  );
}

interface NodeTreeRowExpandToggleProps {
  hasChildren: boolean;
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: (nodeId: string) => void;
}

function NodeTreeRowExpandToggle({
  hasChildren,
  isCollapsed,
  label,
  nodeId,
  onToggleCollapse
}: NodeTreeRowExpandToggleProps) {
  if (!hasChildren) {
    return <span aria-hidden="true" className="size-3 flex-none" />;
  }

  return (
    <span
      aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
      className="flex size-3 flex-none items-center justify-center opacity-70"
      onClick={(event) => (event.stopPropagation(), onToggleCollapse(nodeId))}
      onKeyDown={(event) =>
        event.key === 'Enter' || event.key === ' '
          ? (event.preventDefault(), event.stopPropagation(), onToggleCollapse(nodeId))
          : undefined
      }
      role="button"
      tabIndex={0}
    >
      <ChevronDownIcon className={cn(isCollapsed && '-rotate-90')} />
    </span>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-3 w-3 transition-transform', className)}
      viewBox="0 0 16 16"
    >
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}
