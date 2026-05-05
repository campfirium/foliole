import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import type { NodeSelectModifiers } from './NodeListTreeState';
import {
  createNodeTreeRowButtonHandlers,
  renderNodeTreeRowButtonSurface
} from './NodeTreeRowButtonParts';
import { NodeTreeRowFrame } from './NodeTreeRowFrame';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { useRenameState } from './NodeTreeRowRename';
import { resolveNodeRowButtonClassName } from './NodeTreeRowStyle';
interface NodeTreeRowProps {
  descendantCount?: number;
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
  nodeKindLabel?: string;
  nodeId: string;
  rowSpacing: number;
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

function resolveNodeRowStyle(depth: number, rowSpacing: number) {
  return {
    '--node-depth': depth,
    paddingBottom: `${rowSpacing}px`,
    paddingTop: `${rowSpacing}px`
  } as CSSProperties;
}

function resolveNodeTreeItemState(isSelected: boolean) {
  return {
    'aria-pressed': isSelected,
    'aria-selected': isSelected
  };
}

function renderNodeTreeRowButton(props: {
  descendantCount: number;
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
  nodeKindLabel: string;
  nodeId: string;
  rowSpacing: number;
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
  const style = resolveNodeRowStyle(props.depth, props.rowSpacing);
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
        descendantCount: props.descendantCount ?? 0,
        depth: props.depth,
        hasChildren: props.hasChildren,
        isActive: props.isActive,
        isCollapsed: props.isCollapsed,
        isDerived: props.isDerived ?? false,
        isMuted: props.isMuted ?? false,
        mutedOpacity: props.mutedOpacity ?? 1,
        nodeIconKind: props.nodeIconKind ?? 'reading',
        nodeKindLabel: props.nodeKindLabel ?? 'Topic',
        nodeIconState: props.nodeIconState ?? 'scheduled',
        isSelected: props.isSelected,
        label: props.label,
        nodeId: props.nodeId,
        rowSpacing: props.rowSpacing,
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
  descendantCount: number;
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
  nodeKindLabel: string;
  nodeId: string;
  rowSpacing: number;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRename?: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  style: CSSProperties;
}

function NodeTreeRowButton({
  descendantCount,
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
  nodeKindLabel,
  nodeId,
  onContextMenu,
  onKeyDown,
  onRename,
  onSelect,
  onToggleCollapse,
  rowSpacing,
  style
}: NodeTreeRowButtonProps) {
  const rename = useRenameState(label, nodeId, onRename);
  const buttonClassName = resolveNodeRowButtonClassName({ isDerived, isSelected });
  const treeItemState = resolveNodeTreeItemState(isSelected);
  const handlers = createNodeTreeRowButtonHandlers(nodeId, onContextMenu, onKeyDown, onSelect, rename);
  return renderNodeTreeRowButtonSurface({
    buttonClassName,
    depth,
    descendantCount,
    handlers,
    hasChildren,
    isActive,
    isCollapsed,
    isDerived,
    isMuted,
    label,
    mutedOpacity,
    nodeIconKind,
    nodeKindLabel,
    nodeIconState,
    nodeId,
    onToggleCollapse,
    rename,
    rowSpacing,
    style,
    treeItemState
  });
}
