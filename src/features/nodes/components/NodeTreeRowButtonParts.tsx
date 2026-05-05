import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
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
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  showIcon: boolean;
  rename: ReturnType<typeof useRenameState>;
}) {
  return (
    <span
      className={resolveNodeRowContentClassName()}
    >
      <span className="flex min-w-0 w-full items-center gap-1.5 overflow-hidden">
        {props.showIcon ? <NodeTreeRowIcon kind={props.nodeIconKind} state={props.nodeIconState} /> : null}
        {renderNodeLabel(props.label, props.rename)}
        {props.trailingLabelContent ? (
          <span className="flex-none">{props.trailingLabelContent}</span>
        ) : null}
        {props.descendantCount > 0 ? (
          <span aria-hidden="true" className="flex-none text-foreground/55">
            ({props.descendantCount})
          </span>
        ) : null}
      </span>
      {props.secondaryLabel ? (
        <span className="min-w-0 truncate text-xs text-foreground/55">{props.secondaryLabel}</span>
      ) : null}
    </span>
  );
}

export function createNodeTreeRowButtonHandlers(
  hasChildren: boolean,
  onToggleCollapse: (nodeId: string) => void,
  nodeId: string,
  onContextMenu: ((nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void) | undefined,
  onKeyDown: ((nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void) | undefined,
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void,
  rename: ReturnType<typeof useRenameState>
) {
  return {
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      const modifiers = resolveSelectModifiers(event);
      onSelect(nodeId, modifiers);
      if (!hasChildren || modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey) {
        return;
      }
      onToggleCollapse(nodeId);
    },
    onContextMenu: onContextMenu ? (event: ReactMouseEvent<HTMLButtonElement>) => onContextMenu(nodeId, event) : undefined,
    onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => (event.stopPropagation(), rename.beginRename()),
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'F2') {
        event.preventDefault();
        rename.beginRename();
        return;
      }
      onKeyDown?.(nodeId, event);
    }
  };
}

export function renderNodeTreeRowButtonSurface(props: {
  buttonClassName: string;
  depth: number;
  descendantCount: number;
  handlers: ReturnType<typeof createNodeTreeRowButtonHandlers>;
  hasChildren: boolean;
  isActive: boolean;
  isBulkSelectionActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isMuted: boolean;
  label: string;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  nodeId: string;
  rename: ReturnType<typeof useRenameState>;
  rowSpacing: number;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  showIcon: boolean;
  style: CSSProperties;
  treeItemState: { 'aria-selected': boolean };
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
      data-node-bulk-selected={props.isBulkSelectionActive && props.treeItemState['aria-selected'] ? 'true' : undefined}
      data-node-row-spacing={String(props.rowSpacing)}
      data-node-visibility={props.isMuted ? 'muted' : 'normal'}
      id={`node-treeitem-${props.nodeId}`}
      onClick={props.handlers.onClick}
      onContextMenu={props.handlers.onContextMenu}
      onDoubleClick={props.handlers.onDoubleClick}
      onKeyDown={props.handlers.onKeyDown}
      role="treeitem"
      style={{
        ...props.style,
        ...(props.isMuted ? { '--node-muted-opacity': props.mutedOpacity } : {})
      } as CSSProperties}
      variant="list"
    >
      {renderNodeTreeRowButtonBody(props)}
    </AppButton>
  );
}

function renderNodeTreeRowButtonBody(
  props: Parameters<typeof renderNodeTreeRowButtonSurface>[0]
) {
  return (
    <>
      <NodeTreeRowExpandToggle
        hasChildren={props.hasChildren}
        isCollapsed={props.isCollapsed}
        label={props.label}
        nodeId={props.nodeId}
        onToggleCollapse={props.onToggleCollapse}
      />
      {renderNodeTreeRowContent({
        descendantCount: props.descendantCount,
        isMuted: props.isMuted,
        label: props.label,
        mutedOpacity: props.mutedOpacity,
        nodeIconKind: props.nodeIconKind,
        nodeIconState: props.nodeIconState,
        secondaryLabel: props.secondaryLabel,
        trailingLabelContent: props.trailingLabelContent,
        showIcon: props.showIcon,
        rename: props.rename
      })}
    </>
  );
}
