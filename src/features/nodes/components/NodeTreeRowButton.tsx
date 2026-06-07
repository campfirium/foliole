import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from 'react';

import { definedProps } from '../../../shared/lib/definedProps';

import type { NodeSelectModifiers } from './NodeListTreeState';
import {
  createNodeTreeRowButtonHandlers,
  renderNodeTreeRowButtonSurface
} from './NodeTreeRowButtonParts';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { useRenameState } from './NodeTreeRowRename';
import { resolveNodeRowButtonClassName } from './NodeTreeRowStyle';

export interface NodeTreeRowButtonProps {
  descendantCount: number;
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  isBulkSelectionActive: boolean;
  isCollapsed: boolean;
  isDerived: boolean;
  isHighlighted: boolean;
  isMuted: boolean;
  mutedOpacity: number;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  showIcon: boolean;
  showLeafChevronPlaceholder: boolean;
  isSelected: boolean;
  label: string;
  labelTooltipText?: string;
  nodeId: string;
  ariaPosInSet?: number;
  ariaSetSize?: number;
  rowSpacing: number;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRename?: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  style: CSSProperties;
}

export function NodeTreeRowButton(props: NodeTreeRowButtonProps) {
  const rename = useRenameState(props.label, props.nodeId, props.onRename);
  const buttonClassName = resolveNodeRowButtonClassName({
    depth: props.depth,
    isBulkSelectionActive: props.isBulkSelectionActive,
    isDerived: props.isDerived,
    isHighlighted: props.isHighlighted,
    isSelected: props.isSelected
  });
  const handlers = createNodeTreeRowButtonHandlers(
    props.nodeId,
    props.onContextMenu,
    props.onKeyDown,
    props.onSelect,
    rename
  );
  return renderNodeTreeRowButtonSurface({
    buttonClassName,
    depth: props.depth,
    descendantCount: props.descendantCount,
    handlers,
    hasChildren: props.hasChildren,
    isActive: props.isActive,
    isBulkSelectionActive: props.isBulkSelectionActive,
    isCollapsed: props.isCollapsed,
    isDerived: props.isDerived,
    isHighlighted: props.isHighlighted,
    isMuted: props.isMuted,
    label: props.label,
    ...definedProps({ labelTooltipText: props.labelTooltipText }),
    mutedOpacity: props.mutedOpacity,
    nodeIconKind: props.nodeIconKind,
    nodeIconState: props.nodeIconState,
    nodeId: props.nodeId,
    ...(props.ariaPosInSet !== undefined ? { ariaPosInSet: props.ariaPosInSet } : {}),
    ...(props.ariaSetSize !== undefined ? { ariaSetSize: props.ariaSetSize } : {}),
    ...definedProps({
      secondaryLabel: props.secondaryLabel,
      trailingLabelContent: props.trailingLabelContent
    }),
    showIcon: props.showIcon,
    showLeafChevronPlaceholder: props.showLeafChevronPlaceholder,
    onToggleCollapse: props.onToggleCollapse,
    rename,
    rowSpacing: props.rowSpacing,
    style: props.style,
    treeItemState: { 'aria-selected': props.isSelected }
  });
}
