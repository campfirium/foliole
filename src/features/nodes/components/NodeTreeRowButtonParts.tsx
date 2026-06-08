import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from 'react';

import { definedProps } from '../../../shared/lib/definedProps';
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

function renderLabelCluster(props: {
  label: string;
  labelTooltipText?: string;
  rename: ReturnType<typeof useRenameState>;
  trailingLabelContent?: ReactNode;
}) {
  if (!props.trailingLabelContent) {
    return renderNodeLabel(props.label, props.rename, undefined, props.labelTooltipText);
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
      {renderNodeLabel(props.label, props.rename, 'node-tree-row-text block min-w-0 truncate', props.labelTooltipText)}
      {renderInlineTrailingContent(props.trailingLabelContent)}
    </span>
  );
}

function renderInlineTrailingContent(content: ReactNode) {
  if (!content) {
    return null;
  }
  return (
    <span className="flex-none">
      {content}
    </span>
  );
}

function renderRowCount(descendantCount: number) {
  if (descendantCount <= 0) {
    return null;
  }
  return (
    <span aria-hidden="true" className="node-tree-row-text ml-auto flex-none tabular-nums text-[12px] leading-5 text-foreground/48">
      {descendantCount}
    </span>
  );
}

function resolveNodeTreeRowDataAttributes(props: {
  isBulkSelectionActive: boolean;
  isDerived: boolean;
  isHighlighted: boolean;
  isMuted: boolean;
  nodeId: string;
  rowSpacing: number;
  treeItemState: { 'aria-selected': boolean };
}) {
  return {
    'data-node-bulk-selected': props.isBulkSelectionActive && props.treeItemState['aria-selected'] ? 'true' : undefined,
    'data-node-derived': props.isDerived ? 'true' : 'false',
    'data-node-emphasis': props.isDerived ? 'secondary' : 'primary',
    'data-node-id': props.nodeId,
    'data-node-location-highlight': props.isHighlighted ? 'true' : undefined,
    'data-node-row-spacing': String(props.rowSpacing),
    'data-node-visibility': props.isMuted ? 'muted' : 'normal'
  };
}

export function renderNodeTreeRowContent(props: {
  descendantCount: number;
  isMuted: boolean;
  label: string;
  labelTooltipText?: string;
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
      <span className="flex min-w-0 w-full items-center gap-[0.3125rem] overflow-hidden">
        {props.showIcon ? <NodeTreeRowIcon kind={props.nodeIconKind} state={props.nodeIconState} /> : null}
      {renderLabelCluster({
        label: props.label,
        rename: props.rename,
        ...definedProps({
          labelTooltipText: props.labelTooltipText,
          trailingLabelContent: props.trailingLabelContent
        })
      })}
        {renderRowCount(props.descendantCount)}
      </span>
      {props.secondaryLabel ? (
        <span className="node-tree-row-text min-w-0 truncate text-xs text-foreground/55">{props.secondaryLabel}</span>
      ) : null}
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
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      const modifiers = resolveSelectModifiers(event);
      onSelect(nodeId, modifiers);
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
  isHighlighted: boolean;
  isMuted: boolean;
  label: string;
  labelTooltipText?: string;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  nodeId: string;
  ariaPosInSet?: number;
  ariaSetSize?: number;
  rename: ReturnType<typeof useRenameState>;
  rowSpacing: number;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  showIcon: boolean;
  showLeafChevronPlaceholder: boolean;
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
      aria-posinset={props.ariaPosInSet}
      aria-setsize={props.ariaSetSize}
      {...props.treeItemState}
      className={props.buttonClassName}
      {...resolveNodeTreeRowDataAttributes(props)}
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
        nodeId={props.nodeId}
        onToggleCollapse={props.onToggleCollapse}
        showLeafPlaceholder={props.showLeafChevronPlaceholder}
      />
      {renderNodeTreeRowContent({
        descendantCount: props.descendantCount,
        isMuted: props.isMuted,
        label: props.label,
        mutedOpacity: props.mutedOpacity,
        nodeIconKind: props.nodeIconKind,
        nodeIconState: props.nodeIconState,
        ...definedProps({
          labelTooltipText: props.labelTooltipText,
          secondaryLabel: props.secondaryLabel,
          trailingLabelContent: props.trailingLabelContent
        }),
        showIcon: props.showIcon,
        rename: props.rename
      })}
    </>
  );
}
