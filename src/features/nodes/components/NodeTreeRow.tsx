import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import { cn } from '../../../lib/utils';
import { AppButton } from '../../../shared/ui';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeRenameInput, useRenameState } from './NodeTreeRowRename';

interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived?: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  isDragDisabled?: boolean;
  isDropTarget?: boolean;
  dropIntent?: 'before' | 'after' | 'child' | null;
  label: string;
  nodeId: string;
  onDragEnd?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragStart?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRename?: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
}

function resolveSelectModifiers(event: ReactMouseEvent<HTMLButtonElement>): NodeSelectModifiers {
  return {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

export function NodeTreeRow({
  depth,
  isActive,
  isCollapsed,
  isDerived = false,
  isSelected,
  hasChildren,
  isDragDisabled = false,
  isDropTarget = false,
  dropIntent = null,
  label,
  nodeId,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDragStart,
  onDrop,
  onContextMenu,
  onKeyDown,
  onRename,
  onSelect,
  onToggleCollapse
}: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <div
      className={cn(
        isDropTarget && dropIntent === 'child' && 'border border-border-strong bg-foreground/[0.06]',
        isDropTarget && dropIntent === 'before' && 'border-t-2 border-border-strong',
        isDropTarget && dropIntent === 'after' && 'border-b-2 border-border-strong'
      )}
      draggable={!isDragDisabled}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter ? (event) => onDragEnter(nodeId, event) : undefined}
      onDragOver={onDragOver ? (event) => onDragOver(nodeId, event) : undefined}
      onDragStart={onDragStart ? (event) => onDragStart(nodeId, event) : undefined}
      onDrop={onDrop ? (event) => onDrop(nodeId, event) : undefined}
      title={isDragDisabled ? 'Derived nodes cannot be moved.' : undefined}
    >
      <NodeTreeRowButton
        depth={depth}
        hasChildren={hasChildren}
        isActive={isActive}
        isCollapsed={isCollapsed}
        isDerived={isDerived}
        isSelected={isSelected}
        label={label}
        nodeId={nodeId}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onRename={onRename}
        onSelect={onSelect}
        onToggleCollapse={onToggleCollapse}
        style={style}
      />
    </div>
  );
}

interface NodeTreeRowButtonProps {
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isSelected: boolean;
  label: string;
  nodeId: string;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRename?: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  style: CSSProperties;
}

function renderNodeLabel(label: string, rename: ReturnType<typeof useRenameState>) {
  if (rename.isRenaming) {
    return (
      <NodeRenameInput
        draftTitle={rename.draftTitle}
        label={label}
        onCancel={rename.cancelRename}
        onChange={rename.setDraftTitle}
        onSubmit={rename.submitRename}
      />
    );
  }
  return <span className="min-w-0 truncate">{label}</span>;
}

function NodeTreeRowButton({
  depth,
  hasChildren,
  isActive,
  isCollapsed,
  isDerived,
  isSelected,
  label,
  nodeId,
  onContextMenu,
  onKeyDown,
  onRename,
  onSelect,
  onToggleCollapse,
  style
}: NodeTreeRowButtonProps) {
  const rename = useRenameState(label, nodeId, onRename);
  return (
    <AppButton
      active={false}
      aria-current={isActive ? 'page' : undefined}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      aria-level={depth + 1}
      aria-pressed={isSelected}
      aria-selected={isSelected}
      className={cn(
        'gap-2 pl-[calc(0.5rem+var(--node-depth,0)*1rem)] pr-4',
        !isDerived && 'text-[#111317] font-medium',
        isDerived && 'text-foreground/70',
        isSelected && 'bg-foreground/[0.05]'
      )}
      data-node-derived={isDerived ? 'true' : 'false'}
      data-node-id={nodeId}
      id={`node-treeitem-${nodeId}`}
      onContextMenu={onContextMenu ? (event) => onContextMenu(nodeId, event) : undefined}
      onKeyDown={onKeyDown ? (event) => onKeyDown(nodeId, event) : undefined}
      onClick={(event) => onSelect(nodeId, resolveSelectModifiers(event))}
      onDoubleClick={(event) => (event.stopPropagation(), rename.beginRename())}
      role="treeitem"
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
      {renderNodeLabel(label, rename)}
    </AppButton>
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
