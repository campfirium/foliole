import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import { AppButton } from '../../../shared/ui';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRowFrame } from './NodeTreeRowFrame';
import { NodeTreeRowIcon } from './NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { NodeTreeRowExpandToggle, renderNodeLabel } from './NodeTreeRowParts';
import { useRenameState } from './NodeTreeRowRename';
import { resolveNodeRowButtonClassName, resolveNodeVisibilityValue } from './NodeTreeRowStyle';
interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived?: boolean;
  isMuted?: boolean;
  mutedOpacity?: number;
  nodeIconKind?: NodeTreeRowIconKind;
  nodeIconState?: NodeTreeRowIconState;
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

function resolveNodeRowStyle(depth: number) {
  return { '--node-depth': depth } as CSSProperties;
}

function renderNodeTreeRowButton(props: {
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isMuted: boolean;
  mutedOpacity: number;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  isSelected: boolean;
  label: string;
  nodeId: string;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRename?: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  style: CSSProperties;
}) {
  return <NodeTreeRowButton {...props} />;
}

export function NodeTreeRow(props: NodeTreeRowProps) {
  const style = resolveNodeRowStyle(props.depth);
  return (
    <NodeTreeRowFrame
      dropIntent={props.dropIntent ?? null}
      isDragDisabled={props.isDragDisabled ?? false}
      isDropTarget={props.isDropTarget ?? false}
      nodeId={props.nodeId}
      onDragEnd={props.onDragEnd}
      onDragEnter={props.onDragEnter}
      onDragOver={props.onDragOver}
      onDragStart={props.onDragStart}
      onDrop={props.onDrop}
    >
      {renderNodeTreeRowButton({
        depth: props.depth,
        hasChildren: props.hasChildren,
        isActive: props.isActive,
        isCollapsed: props.isCollapsed,
        isDerived: props.isDerived ?? false,
        isMuted: props.isMuted ?? false,
        mutedOpacity: props.mutedOpacity ?? 1,
        nodeIconKind: props.nodeIconKind ?? 'reading',
        nodeIconState: props.nodeIconState ?? 'scheduled',
        isSelected: props.isSelected,
        label: props.label,
        nodeId: props.nodeId,
        onContextMenu: props.onContextMenu,
        onKeyDown: props.onKeyDown,
        onRename: props.onRename,
        onSelect: props.onSelect,
        onToggleCollapse: props.onToggleCollapse,
        style
      })}
    </NodeTreeRowFrame>
  );
}
interface NodeTreeRowButtonProps {
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isMuted: boolean;
  mutedOpacity: number;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
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

function NodeTreeRowButton({
  depth,
  hasChildren,
  isActive,
  isCollapsed,
  isDerived,
  isMuted,
  mutedOpacity,
  nodeIconKind,
  nodeIconState,
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
  const buttonClassName = resolveNodeRowButtonClassName({ isDerived, isMuted, isSelected });
  return (
    <AppButton
      active={false}
      aria-current={isActive ? 'page' : undefined}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      aria-level={depth + 1}
      aria-pressed={isSelected} aria-selected={isSelected}
      className={buttonClassName}
      data-node-derived={isDerived ? 'true' : 'false'}
      data-node-emphasis={isDerived ? 'secondary' : 'primary'}
      data-node-id={nodeId}
      data-node-visibility={resolveNodeVisibilityValue(isMuted)}
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
      <span className="node-tree-row-content inline-flex min-w-0 items-center" style={isMuted ? { opacity: mutedOpacity } : undefined}>
        <NodeTreeRowIcon kind={nodeIconKind} state={nodeIconState} />
        {renderNodeLabel(label, rename)}
      </span>
    </AppButton>
  );
}
