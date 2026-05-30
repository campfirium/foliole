import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';

import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

interface WorkspaceVirtualRowsProps {
  activeVirtualNodeId?: string | null;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  onContextMenuSavedSearch: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDeleteVirtualNode: (nodeId: string) => void;
  onOpenVirtualView?: (nodeId?: string) => void;
  onRenameVirtualNode: (nodeId: string, title: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  virtualResultCountById?: ReadonlyMap<string, number> | undefined;
}

export function toggleCollapsed(nodeId: string, setCollapsedIds: Dispatch<SetStateAction<Set<string>>>) {
  setCollapsedIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
}

function renderBuiltinVirtualRow(
  props: Pick<WorkspaceVirtualRowsProps, 'activeVirtualNodeId' | 'isVirtualViewOpen' | 'onOpenVirtualView'> & {
    label: string;
    nodeId: string;
    onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
    rowSpacing: number;
  }
) {
  return (
    <NodeTreeRow
      depth={1}
      hasChildren={false}
      isActive={props.isVirtualViewOpen && props.activeVirtualNodeId === props.nodeId}
      isCollapsed={false}
      isSelected={props.isVirtualViewOpen && props.activeVirtualNodeId === props.nodeId}
      key={props.nodeId}
      label={props.label}
      nodeId={props.nodeId}
      rowSpacing={props.rowSpacing}
      showIcon={false}
      onKeyDown={props.onRowKeyDown}
      onSelect={() => props.onOpenVirtualView?.(props.nodeId)}
      onToggleCollapse={() => undefined}
    />
  );
}

export function renderVirtualRows(args: {
  collapsedIds: Set<string>;
  onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
  props: WorkspaceVirtualRowsProps;
  rowSpacing: number;
  rows: ReturnType<typeof buildVisibleNodeTreeRows>;
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  return args.rows.flatMap((row) => renderVirtualRow({ ...args, row }));
}

function renderVirtualRow(args: Parameters<typeof renderVirtualRows>[0] & {
  row: ReturnType<typeof buildVisibleNodeTreeRows>[number];
}) {
  const isSelected = args.props.isVirtualViewOpen && (args.props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID) === args.row.node.id;
  const isVirtualRoot = args.row.node.id === VIRTUAL_ROOT_NODE_ID;
  const isVirtualRootCollapsed = args.collapsedIds.has(VIRTUAL_ROOT_NODE_ID);
  const isSavedSearch = isVirtualNode(args.row.node);
  const virtualRow = renderMainVirtualRow({ ...args, isSavedSearch, isSelected, isVirtualRoot });
  return isVirtualRoot && !isVirtualRootCollapsed
    ? [virtualRow, renderShelvedRow(args), renderRemovedRow(args)]
    : [virtualRow];
}

function renderMainVirtualRow(args: Parameters<typeof renderVirtualRow>[0] & {
  isSavedSearch: boolean;
  isSelected: boolean;
  isVirtualRoot: boolean;
}) {
  return (
    <NodeTreeRow
      depth={args.row.depth}
      hasChildren={args.isVirtualRoot ? true : args.row.hasChildren}
      isActive={args.isSelected}
      isCollapsed={args.collapsedIds.has(args.row.node.id)}
      isSelected={args.isSelected}
      key={args.row.node.id}
      label={args.row.node.title}
      nodeId={args.row.node.id}
      descendantCount={args.isVirtualRoot ? 0 : (args.props.virtualResultCountById?.get(args.row.node.id) ?? 0)}
      rowSpacing={args.rowSpacing}
      showIcon={false}
      {...(args.isSavedSearch ? { onRename: args.props.onRenameVirtualNode } : {})}
      {...(args.isSavedSearch ? { onContextMenu: args.props.onContextMenuSavedSearch } : {})}
      onKeyDown={args.onRowKeyDown}
      onSelect={(nodeId) => {
        args.props.onOpenVirtualView?.(nodeId);
        args.props.onSelectNodeInVirtualView(nodeId);
      }}
      onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, args.setCollapsedIds)}
    />
  );
}

function renderShelvedRow(args: Parameters<typeof renderVirtualRows>[0]) {
  return renderBuiltinVirtualRow({ ...args.props, label: 'Shelved', nodeId: VIRTUAL_SHELVED_NODE_ID, onRowKeyDown: args.onRowKeyDown, rowSpacing: args.rowSpacing });
}

function renderRemovedRow(args: Parameters<typeof renderVirtualRows>[0]) {
  return renderBuiltinVirtualRow({ ...args.props, label: 'Removed', nodeId: VIRTUAL_REMOVED_NODE_ID, onRowKeyDown: args.onRowKeyDown, rowSpacing: args.rowSpacing });
}

export function getVirtualKeyboardRows(
  rows: ReturnType<typeof buildVisibleNodeTreeRows>,
  collapsedIds: Set<string>
) {
  return rows.flatMap((row) =>
    row.node.id === VIRTUAL_ROOT_NODE_ID && !collapsedIds.has(VIRTUAL_ROOT_NODE_ID)
      ? [
          { ...row, hasChildren: true },
          { depth: 1, hasChildren: false, id: VIRTUAL_SHELVED_NODE_ID },
          { depth: 1, hasChildren: false, id: VIRTUAL_REMOVED_NODE_ID }
        ]
      : row.node.id === VIRTUAL_ROOT_NODE_ID
        ? [{ ...row, hasChildren: true }]
        : [row]
  );
}
