import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from 'react';
import { memo } from 'react';

import { recordNodeListRowRender } from '../../../shared/platform/performanceDiagnosticsProbe';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRowButton } from './NodeTreeRowButton';
import { NodeTreeRowFrame } from './NodeTreeRowFrame';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { useRenameState } from './NodeTreeRowRename';

interface NodeTreeRowProps {
  descendantCount?: number;
  depth: number;
  isActive: boolean;
  isBulkSelectionActive?: boolean;
  isCollapsed: boolean;
  isDerived?: boolean;
  isHighlighted?: boolean;
  isMuted?: boolean;
  mutedOpacity?: number;
  nodeIconKind?: NodeTreeRowIconKind;
  nodeIconState?: NodeTreeRowIconState;
  showIcon?: boolean;
  showLeafChevronPlaceholder?: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  dragDisabledLabel?: string | null;
  isDragDisabled?: boolean;
  isDropTarget?: boolean;
  dropIntent?: 'before' | 'after' | 'child' | null;
  ariaPosInSet?: number;
  ariaSetSize?: number;
  label: string;
  labelTooltipText?: string;
  nodeId: string;
  rowSpacing: number;
  tabIndex?: number;
  rowAction?: ReactNode;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  onDragEnd?: () => void;
  onDragEnter?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => void;
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

function renderNodeTreeRowButton(props: {
  descendantCount: number;
  depth: number;
  hasChildren: boolean;
  hasRowAction: boolean;
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
  tabIndex?: number;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rename: ReturnType<typeof useRenameState>;
  style: CSSProperties;
}) {
  return <NodeTreeRowButton {...props} />;
}

function NodeTreeRowImpl(props: NodeTreeRowProps) {
  recordNodeListRowRender(props.nodeId);
  const rename = useRenameState(props.label, props.nodeId, props.onRename);
  const style = resolveNodeRowStyle(props.depth, props.rowSpacing);
  return (
    <NodeTreeRowFrame
      dropIntent={props.dropIntent ?? null}
      isDragDisabled={(props.isDragDisabled ?? false) || rename.isRenaming}
      isDropTarget={props.isDropTarget ?? false}
      nodeId={props.nodeId}
      {...(props.rowAction !== undefined ? { rowAction: props.rowAction } : {})}
      {...(props.onDragEnd ? { onDragEnd: props.onDragEnd } : {})}
      {...(props.onDragEnter ? { onDragEnter: props.onDragEnter } : {})}
      {...(props.onDragLeave ? { onDragLeave: props.onDragLeave } : {})}
      {...(props.onDragOver ? { onDragOver: props.onDragOver } : {})}
      {...(props.onDragStart ? { onDragStart: props.onDragStart } : {})}
      {...(props.onDrop ? { onDrop: props.onDrop } : {})}
    >
      {renderNodeTreeRowButton({
        descendantCount: props.descendantCount ?? 0,
        depth: props.depth,
        hasChildren: props.hasChildren,
        hasRowAction: props.rowAction !== undefined,
        isActive: props.isActive,
        isBulkSelectionActive: props.isBulkSelectionActive ?? false,
        isCollapsed: props.isCollapsed,
        isDerived: props.isDerived ?? false,
        isHighlighted: props.isHighlighted ?? false,
        isMuted: props.isMuted ?? false,
        mutedOpacity: props.mutedOpacity ?? 1,
        nodeIconKind: props.nodeIconKind ?? 'reading',
        nodeIconState: props.nodeIconState ?? 'scheduled',
        showIcon: props.showIcon ?? true,
        showLeafChevronPlaceholder: props.showLeafChevronPlaceholder ?? true,
        isSelected: props.isSelected,
        label: props.label,
        ...(props.labelTooltipText !== undefined ? { labelTooltipText: props.labelTooltipText } : {}),
        nodeId: props.nodeId,
        ...(props.ariaPosInSet !== undefined ? { ariaPosInSet: props.ariaPosInSet } : {}),
        ...(props.ariaSetSize !== undefined ? { ariaSetSize: props.ariaSetSize } : {}),
        rowSpacing: props.rowSpacing,
        ...(props.tabIndex !== undefined ? { tabIndex: props.tabIndex } : {}),
        ...(props.secondaryLabel !== undefined ? { secondaryLabel: props.secondaryLabel } : {}),
        ...(props.trailingLabelContent !== undefined ? { trailingLabelContent: props.trailingLabelContent } : {}),
        ...(props.onContextMenu ? { onContextMenu: props.onContextMenu } : {}),
        ...(props.onKeyDown ? { onKeyDown: props.onKeyDown } : {}),
        onSelect: props.onSelect,
        onToggleCollapse: props.onToggleCollapse,
        rename,
        style
      })}
    </NodeTreeRowFrame>
  );
}

function areNodeTreeRowPropsEqual(previous: NodeTreeRowProps, next: NodeTreeRowProps) {
  return (
    previous.descendantCount === next.descendantCount &&
    previous.depth === next.depth &&
    previous.dragDisabledLabel === next.dragDisabledLabel &&
    previous.dropIntent === next.dropIntent &&
    previous.hasChildren === next.hasChildren &&
    previous.isActive === next.isActive &&
    previous.isBulkSelectionActive === next.isBulkSelectionActive &&
    previous.isCollapsed === next.isCollapsed &&
    previous.isDerived === next.isDerived &&
    previous.isHighlighted === next.isHighlighted &&
    previous.isDragDisabled === next.isDragDisabled &&
    previous.isDropTarget === next.isDropTarget &&
    previous.ariaPosInSet === next.ariaPosInSet &&
    previous.ariaSetSize === next.ariaSetSize &&
    previous.isMuted === next.isMuted &&
    previous.isSelected === next.isSelected &&
    previous.label === next.label &&
    previous.labelTooltipText === next.labelTooltipText &&
    previous.mutedOpacity === next.mutedOpacity &&
    previous.nodeIconKind === next.nodeIconKind &&
    previous.nodeIconState === next.nodeIconState &&
    previous.showIcon === next.showIcon &&
    previous.showLeafChevronPlaceholder === next.showLeafChevronPlaceholder &&
    previous.rowSpacing === next.rowSpacing &&
    previous.tabIndex === next.tabIndex &&
    previous.rowAction === next.rowAction &&
    previous.secondaryLabel === next.secondaryLabel &&
    previous.trailingLabelContent === next.trailingLabelContent &&
    previous.onContextMenu === next.onContextMenu &&
    previous.onDragEnd === next.onDragEnd &&
    previous.onDragEnter === next.onDragEnter &&
    previous.onDragLeave === next.onDragLeave &&
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
