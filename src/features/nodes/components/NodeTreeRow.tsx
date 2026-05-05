import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';
import { memo } from 'react';

import { recordNodeListRowRender } from '../../../shared/platform/performanceDiagnosticsProbe';

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
  showIcon?: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  isDragDisabled?: boolean;
  isDropTarget?: boolean;
  dropIntent?: 'before' | 'after' | 'child' | null;
  label: string;
  nodeId: string;
  rowSpacing: number;
  onDragEnd?: () => void;
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
  showIcon: boolean;
  isSelected: boolean;
  label: string;
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

function NodeTreeRowImpl(props: NodeTreeRowProps) {
  recordNodeListRowRender(props.nodeId);
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
        nodeIconState: props.nodeIconState ?? 'scheduled',
        showIcon: props.showIcon ?? true,
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

function areNodeTreeRowPropsEqual(previous: NodeTreeRowProps, next: NodeTreeRowProps) {
  return (
    previous.descendantCount === next.descendantCount &&
    previous.depth === next.depth &&
    previous.dropIntent === next.dropIntent &&
    previous.hasChildren === next.hasChildren &&
    previous.isActive === next.isActive &&
    previous.isCollapsed === next.isCollapsed &&
    previous.isDerived === next.isDerived &&
    previous.isDragDisabled === next.isDragDisabled &&
    previous.isDropTarget === next.isDropTarget &&
    previous.isMuted === next.isMuted &&
    previous.isSelected === next.isSelected &&
    previous.label === next.label &&
    previous.mutedOpacity === next.mutedOpacity &&
    previous.nodeIconKind === next.nodeIconKind &&
    previous.nodeIconState === next.nodeIconState &&
    previous.showIcon === next.showIcon &&
    previous.rowSpacing === next.rowSpacing &&
    previous.onContextMenu === next.onContextMenu &&
    previous.onDragEnd === next.onDragEnd &&
    previous.onDragEnter === next.onDragEnter &&
    previous.onDragOver === next.onDragOver &&
    previous.onDragStart === next.onDragStart &&
    previous.onDrop === next.onDrop &&
    previous.onKeyDown === next.onKeyDown &&
    previous.onRename === next.onRename &&
    previous.onSelect === next.onSelect &&
    previous.onToggleCollapse === next.onToggleCollapse
  );
}

export const NodeTreeRow = memo(NodeTreeRowImpl, areNodeTreeRowPropsEqual);

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
  showIcon: boolean;
  isSelected: boolean;
  label: string;
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
  showIcon,
  isSelected,
  label,
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
  const buttonClassName = resolveNodeRowButtonClassName({ depth, isDerived, isSelected });
  const treeItemState = resolveNodeTreeItemState(isSelected);
  const handlers = createNodeTreeRowButtonHandlers(
    hasChildren,
    onToggleCollapse,
    nodeId,
    onContextMenu,
    onKeyDown,
    onSelect,
    rename
  );
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
    nodeIconState,
    nodeId,
    showIcon,
    onToggleCollapse,
    rename,
    rowSpacing,
    style,
    treeItemState
  });
}
