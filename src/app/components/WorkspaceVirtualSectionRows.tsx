import { FolderPlus, Layers2 } from 'lucide-react';
import type { Dispatch, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';

import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_PUBLISHED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppIconButton } from '../../shared/ui';

interface WorkspaceVirtualRowsProps {
  activeVirtualNodeId?: string | null;
  createNestedVirtualFolderLabel: (title: string) => string;
  createVirtualFolderLabel: string;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  onContextMenuSavedSearch: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onCreateVirtualFolder: (parentNodeId?: string) => void;
  onDeleteVirtualNode: (nodeId: string) => void;
  onDragEndVirtualFolder: () => void;
  onDragEnterVirtualFolder: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragLeaveVirtualFolder: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverVirtualFolder: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragStartVirtualFolder: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropOnVirtualFolder: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
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
      showLeafChevronPlaceholder={false}
      onKeyDown={props.onRowKeyDown}
      onSelect={() => props.onOpenVirtualView?.(props.nodeId)}
      onToggleCollapse={() => undefined}
    />
  );
}

export function renderVirtualRows(args: {
  collapsedIds: Set<string>;
  dropTargetNodeId: string | null;
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
    ? [virtualRow, renderPublishedRow(args), renderShelvedRow(args), renderRemovedRow(args)]
    : [virtualRow];
}

function renderMainVirtualRow(args: Parameters<typeof renderVirtualRow>[0] & {
  isSavedSearch: boolean;
  isSelected: boolean;
  isVirtualRoot: boolean;
}) {
  const row = (
    <NodeTreeRow
      depth={args.row.depth}
      hasChildren={args.isVirtualRoot ? true : args.row.hasChildren}
      isActive={args.isSelected}
      isCollapsed={args.collapsedIds.has(args.row.node.id)}
      isDragDisabled={args.isVirtualRoot}
      isDropTarget={args.dropTargetNodeId === args.row.node.id}
      isSelected={args.isSelected}
      key={undefined}
      label={args.row.node.title}
      nodeId={args.row.node.id}
      descendantCount={args.isVirtualRoot ? 0 : (args.props.virtualResultCountById?.get(args.row.node.id) ?? 0)}
      rowSpacing={args.rowSpacing}
      showIcon={false}
      showLeafChevronPlaceholder={false}
      {...(args.isVirtualRoot ? { trailingLabelContent: <VirtualRootMarker /> } : {})}
      {...(args.isSavedSearch ? { onRename: args.props.onRenameVirtualNode } : {})}
      {...(args.isSavedSearch ? { onContextMenu: args.props.onContextMenuSavedSearch } : {})}
      {...(args.isSavedSearch ? {
        onDragEnd: args.props.onDragEndVirtualFolder,
        onDragStart: args.props.onDragStartVirtualFolder
      } : {})}
      {...(args.isVirtualRoot || args.isSavedSearch ? {
        dropIntent: 'child' as const,
        onDragEnter: args.props.onDragEnterVirtualFolder,
        onDragLeave: args.props.onDragLeaveVirtualFolder,
        onDragOver: args.props.onDragOverVirtualFolder,
        onDrop: args.props.onDropOnVirtualFolder
      } : {})}
      onKeyDown={args.onRowKeyDown}
      onSelect={(nodeId) => {
        args.props.onOpenVirtualView?.(nodeId);
        args.props.onSelectNodeInVirtualView(nodeId);
      }}
      onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, args.setCollapsedIds)}
    />
  );
  const createLabel = args.isVirtualRoot
    ? args.props.createVirtualFolderLabel
    : args.props.createNestedVirtualFolderLabel(args.row.node.title);
  return (
    <div className="group/virtual-row relative" key={args.row.node.id}>
      {row}
      <AppIconButton
        className={`absolute right-1 top-1/2 z-10 size-7 -translate-y-1/2 text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground ${args.isVirtualRoot ? '' : 'opacity-0 focus-visible:opacity-100 group-hover/virtual-row:opacity-100'}`}
        icon={<FolderPlus size={15} strokeWidth={1.9} />}
        label={createLabel}
        onClick={() => args.props.onCreateVirtualFolder(args.isVirtualRoot ? undefined : args.row.node.id)}
      />
    </div>
  );
}

function VirtualRootMarker() {
  return (
    <span className="inline-flex size-3.5 items-center justify-center align-middle text-foreground/45" data-virtual-root-marker="true">
      <Layers2 aria-hidden="true" className="-translate-y-[1px]" size={14} strokeWidth={1.7} />
    </span>
  );
}


function renderShelvedRow(args: Parameters<typeof renderVirtualRows>[0]) {
  return renderBuiltinVirtualRow({ ...args.props, label: 'Shelved', nodeId: VIRTUAL_SHELVED_NODE_ID, onRowKeyDown: args.onRowKeyDown, rowSpacing: args.rowSpacing });
}

function renderPublishedRow(args: Parameters<typeof renderVirtualRows>[0]) {
  return renderBuiltinVirtualRow({ ...args.props, label: 'Published', nodeId: VIRTUAL_PUBLISHED_NODE_ID, onRowKeyDown: args.onRowKeyDown, rowSpacing: args.rowSpacing });
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
          { depth: 1, hasChildren: false, id: VIRTUAL_PUBLISHED_NODE_ID },
          { depth: 1, hasChildren: false, id: VIRTUAL_SHELVED_NODE_ID },
          { depth: 1, hasChildren: false, id: VIRTUAL_REMOVED_NODE_ID }
        ]
      : row.node.id === VIRTUAL_ROOT_NODE_ID
        ? [{ ...row, hasChildren: true }]
        : [row]
  );
}
