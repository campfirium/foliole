import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_SHELVED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { compareVirtualNodeTitle } from './workspaceVirtualNodeSort';
import { WorkspaceVirtualSavedSearchContextMenu } from './WorkspaceVirtualSavedSearchContextMenu';
import { getVirtualKeyboardRows, renderVirtualRows, toggleCollapsed } from './WorkspaceVirtualSectionRows';

interface WorkspaceVirtualSectionProps {
  activeVirtualNodeId?: string | null;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  virtualResultCountById?: ReadonlyMap<string, number> | undefined;
}

function selectVirtualKeyboardRow(nodeId: string, props: WorkspaceVirtualSectionProps) {
  if (nodeId === VIRTUAL_REMOVED_NODE_ID || nodeId === VIRTUAL_SHELVED_NODE_ID) {
    props.onOpenVirtualView?.(nodeId);
    return;
  }
  props.onOpenVirtualView?.(nodeId);
  props.onSelectNodeInVirtualView(nodeId);
}

function getContextMenuPosition(event: ReactMouseEvent<HTMLElement>) {
  return {
    left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
    top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
  };
}

function renderSavedSearchContextMenu(args: {
  contextMenu: { left: number; nodeId: string; top: number } | null;
  deleteNode: (nodeId: string) => void;
  setContextMenu: (value: { left: number; nodeId: string; top: number } | null) => void;
}) {
  if (!args.contextMenu) return null;
  return (
    <WorkspaceVirtualSavedSearchContextMenu
      left={args.contextMenu.left}
      nodeId={args.contextMenu.nodeId}
      onClose={() => args.setContextMenu(null)}
      onDelete={args.deleteNode}
      top={args.contextMenu.top}
    />
  );
}

export function WorkspaceVirtualSection(props: WorkspaceVirtualSectionProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ left: number; nodeId: string; top: number } | null>(null);
  const createVirtualNode = useWorkspaceStore((state) => state.createVirtualNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const updateNodeTitle = useWorkspaceStore((state) => state.updateNodeTitle);
  const rowSpacing = getNodeListRowSpacing();
  const onAddVirtualNode = useCallback(async () => {
    const nodeId = await createVirtualNode();
    if (!nodeId) return;
    props.onOpenVirtualView?.(nodeId);
    props.onSelectNodeInVirtualView(nodeId);
  }, [createVirtualNode, props]);
  const rows = useMemo(() => {
    const virtualNodeIds = props.nodeOrder.filter((nodeId) => {
      const node = props.nodesById[nodeId];
      return isVirtualRootNode(node) || isVirtualNode(node);
    }).sort((leftId, rightId) => compareVirtualNodeTitle(leftId, rightId, props.nodesById));
    return buildVisibleNodeTreeRows(buildNodeTree(virtualNodeIds, props.nodesById).rows, collapsedIds);
  }, [collapsedIds, props.nodeOrder, props.nodesById]);
  const keyboardRows = useMemo(() => getVirtualKeyboardRows(rows, collapsedIds), [collapsedIds, rows]);
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: collapsedIds,
        onSelect: (nodeId) => selectVirtualKeyboardRow(nodeId, props),
        onToggleCollapse: (nodeId) => toggleCollapsed(nodeId, setCollapsedIds),
        rows: keyboardRows
      }),
    [collapsedIds, keyboardRows, props]
  );

  if (rows.length === 0) return null;

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label="Virtual folder tree" className="flex flex-col pt-1" role="tree">
        {renderVirtualRows({
          collapsedIds,
          onRowKeyDown,
          props: {
            ...props,
            onAddVirtualNode,
            onContextMenuSavedSearch: (nodeId, event) => {
              event.preventDefault();
              setContextMenu({ nodeId, ...getContextMenuPosition(event) });
            },
            onDeleteVirtualNode: deleteNode,
            onRenameVirtualNode: (nodeId, title) => {
              void updateNodeTitle(nodeId, title);
            }
          },
          rowSpacing,
          rows,
          setCollapsedIds
        })}
        {renderSavedSearchContextMenu({ contextMenu, deleteNode, setContextMenu })}
      </section>
    </div>
  );
}
