import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from '../../features/nodes/components/NodeTreeRow';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type { VirtualListRenderMeta } from '../../shared/ui';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';
import {
  resolveWorkspaceTopicTreeRowDragProps,
  resolveWorkspaceTopicTreeRowModel
} from './workspaceTopicTreeRowModel';

export function WorkspaceTopicTreeRowItem(props: {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: WorkspaceTopicTreeDragController;
  meta?: VirtualListRenderMeta;
  nodesById: WorkspaceListNodesById;
  onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
  onRenameNode: (nodeId: string, title: string) => void;
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  row: NodeTreeRow;
  rowSpacing: number;
  selectedNodeIds: string[];
}) {
  const rowModel = resolveWorkspaceTopicTreeRowModel(props.row, props);

  return (
    <NodeTreeRowItem
      descendantCount={props.row.descendantCount}
      depth={props.row.depth}
      hasChildren={props.row.hasChildren}
      isActive={props.activeNodeId === props.row.node.id}
      isBulkSelectionActive={props.selectedNodeIds.length > 1}
      isCollapsed={props.collapsedNodeIds.has(props.row.node.id)}
      isDerived={rowModel.isDerivedNode}
      isMuted={rowModel.shouldFadeWholeRow}
      mutedOpacity={rowModel.mutedOpacity}
      isSelected={rowModel.isSelected}
      key={props.row.node.id}
      label={props.row.node.title}
      nodeId={props.row.node.id}
      {...(props.meta ? { ariaPosInSet: props.meta.ariaPosInSet, ariaSetSize: props.meta.ariaSetSize } : {})}
      nodeIconKind={rowModel.nodeIconKind}
      nodeIconState={rowModel.nodeIconState}
      showIcon
      showLeafChevronPlaceholder={false}
      rowSpacing={props.rowSpacing}
      {...definedProps({ onContextMenu: props.onContextMenu })}
      {...resolveWorkspaceTopicTreeRowDragProps(
        props.row.node.id,
        rowModel.isDragDisabled,
        props.drag
      )}
      onKeyDown={props.onRowKeyDown}
      onRename={props.onRenameNode}
      onSelect={props.onSelectNode}
      onToggleCollapse={props.onToggleCollapse}
    />
  );
}
