import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import { AppButton } from '../../../shared/ui';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRowIcon } from './NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { NodeTreeRowExpandToggle, renderNodeLabel } from './NodeTreeRowParts';
import type { useRenameState } from './NodeTreeRowRename';
import { resolveNodeRowContentClassName } from './NodeTreeRowStyle';

function resolveSelectModifiers(event: ReactMouseEvent<HTMLButtonElement>): NodeSelectModifiers {
  return {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

export function renderNodeTreeRowContent(props: {
  descendantCount: number;
  isMuted: boolean;
  label: string;
  mutedOpacity: number;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  rename: ReturnType<typeof useRenameState>;
}) {
  return (
    <span
      className={resolveNodeRowContentClassName()}
      style={props.isMuted ? { opacity: props.mutedOpacity } : undefined}
    >
      <NodeTreeRowIcon kind={props.nodeIconKind} state={props.nodeIconState} />
      {renderNodeLabel(props.label, props.rename)}
      <span aria-hidden="true" className="flex-none text-foreground/55">
        ({props.descendantCount})
      </span>
    </span>
  );
}

export function createNodeTreeRowButtonHandlers(
  nodeId: string,
  onContextMenu: ((nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void) | undefined,
  onKeyDown: ((nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void) | undefined,
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void,
  rename: ReturnType<typeof useRenameState>
) {
  return {
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) =>
      onSelect(nodeId, resolveSelectModifiers(event)),
    onContextMenu: onContextMenu ? (event: ReactMouseEvent<HTMLButtonElement>) => onContextMenu(nodeId, event) : undefined,
    onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => (event.stopPropagation(), rename.beginRename()),
    onKeyDown: onKeyDown ? (event: ReactKeyboardEvent<HTMLButtonElement>) => onKeyDown(nodeId, event) : undefined
  };
}

export function renderNodeTreeRowButtonSurface(props: {
  buttonClassName: string;
  depth: number;
  descendantCount: number;
  handlers: ReturnType<typeof createNodeTreeRowButtonHandlers>;
  hasChildren: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isMuted: boolean;
  label: string;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  nodeId: string;
  rename: ReturnType<typeof useRenameState>;
  rowSpacing: number;
  style: CSSProperties;
  treeItemState: { 'aria-pressed': boolean; 'aria-selected': boolean };
  mutedOpacity: number;
  onToggleCollapse: (nodeId: string) => void;
}) {
  return (
    <AppButton
      active={false}
      aria-current={props.isActive ? 'page' : undefined}
      aria-expanded={props.hasChildren ? !props.isCollapsed : undefined}
      aria-level={props.depth + 1}
      {...props.treeItemState}
      className={props.buttonClassName}
      data-node-derived={props.isDerived ? 'true' : 'false'}
      data-node-emphasis={props.isDerived ? 'secondary' : 'primary'}
      data-node-id={props.nodeId}
      data-node-row-spacing={String(props.rowSpacing)}
      data-node-visibility={props.isMuted ? 'muted' : 'normal'}
      id={`node-treeitem-${props.nodeId}`}
      onClick={props.handlers.onClick}
      onContextMenu={props.handlers.onContextMenu}
      onDoubleClick={props.handlers.onDoubleClick}
      onKeyDown={props.handlers.onKeyDown}
      role="treeitem"
      style={props.style}
      variant="list"
    >
      <NodeTreeRowExpandToggle
        hasChildren={props.hasChildren}
        isCollapsed={props.isCollapsed}
        label={props.label}
        nodeId={props.nodeId}
        onToggleCollapse={props.onToggleCollapse}
      />
      {renderNodeTreeRowContent({
        descendantCount: props.descendantCount, isMuted: props.isMuted, label: props.label,
        mutedOpacity: props.mutedOpacity, nodeIconKind: props.nodeIconKind,
        nodeIconState: props.nodeIconState, rename: props.rename
      })}
    </AppButton>
  );
}
