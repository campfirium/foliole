import { useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';

import { type NodeListContextMenuController } from '../../features/nodes/components/NodeListTreeHooks';
import { useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { buildNodeTree, buildVisibleNodeTreeRows, collectNodeAncestorIds, filterNodeTreeRowsByTitle } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState } from '../../shared/ui';

import { WorkspaceTopicTreeRows } from './WorkspaceTopicTreeRows';

export function renderWorkspaceTopicTreeBody(args: {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  contextMenu: NodeListContextMenuController;
  emptyStateDescription: string;
  emptyStateTitle: string;
  nodesById: WorkspaceListNodesById;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: ReturnType<typeof useNodeSelectionHandler>;
  onToggleCollapse: (nodeId: string) => void;
  selectedNodeIds: string[];
  visibleRows: ReturnType<typeof buildVisibleNodeTreeRows>;
}) {
  return (
    <div
      className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-2"
      onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[role="treeitem"]')) {
          return;
        }
        args.contextMenu.openRootContextMenu(event);
      }}
    >
      {args.visibleRows.length === 0 ? (
        <div className="flex min-h-full items-center justify-center px-3 py-6">
          <AppEmptyState
            description={args.emptyStateDescription}
            title={args.emptyStateTitle}
          />
        </div>
      ) : (
        <WorkspaceTopicTreeRows
          activeNodeId={args.activeNodeId}
          collapsedNodeIds={args.collapsedNodeIds}
          nodesById={args.nodesById}
          onContextMenu={args.contextMenu.openContextMenu}
          onRenameNode={args.onRenameNode}
          onSelectNode={args.onSelectNode}
          onToggleCollapse={args.onToggleCollapse}
          rows={args.visibleRows}
          selectedNodeIds={args.selectedNodeIds}
        />
      )}
    </div>
  );
}

export function useWorkspaceTopicTreeCollapse(
  activeFolderId: string,
  activeNodeId: string | null,
  treeRows: ReturnType<typeof buildNodeTree>['rows'],
  parentById: Record<string, string | null>
) {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const previousActiveFolderIdRef = useRef<string | null>(null);
  const collapsibleNodeIds = useMemo(
    () => treeRows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [treeRows]
  );
  const treeRowById = useMemo(
    () => new Map(treeRows.map((row) => [row.node.id, row])),
    [treeRows]
  );

  useEffect(() => {
    const isNewFolder = previousActiveFolderIdRef.current !== activeFolderId;
    previousActiveFolderIdRef.current = activeFolderId;
    setCollapsedNodeIds((current) =>
      isNewFolder ? new Set(collapsibleNodeIds) : pruneCollapsedNodeIds(current, collapsibleNodeIds)
    );
  }, [activeFolderId, collapsibleNodeIds]);

  useEffect(() => {
    if (!activeNodeId) {
      return;
    }
    const activeRow = treeRowById.get(activeNodeId);
    if (!activeRow || activeRow.node.kind === 'folder') {
      return;
    }
    const expandedNodeIds = new Set(collectNodeAncestorIds(activeNodeId, parentById));
    if (activeRow.hasChildren) {
      expandedNodeIds.add(activeNodeId);
    }
    setCollapsedNodeIds((current) => {
      if ([...expandedNodeIds].every((nodeId) => !current.has(nodeId))) {
        return current;
      }
      const next = new Set(current);
      expandedNodeIds.forEach((nodeId) => next.delete(nodeId));
      return next;
    });
  }, [activeNodeId, parentById, treeRowById]);

  return { collapsedNodeIds, setCollapsedNodeIds };
}

function pruneCollapsedNodeIds(
  current: ReadonlySet<string>,
  collapsibleNodeIds: readonly string[]
) {
  const validNodeIds = new Set(collapsibleNodeIds);
  const next = new Set([...current].filter((nodeId) => validNodeIds.has(nodeId)));
  return next.size === current.size ? current : next;
}

export function useWorkspaceTopicTreeRows(
  treeRows: ReturnType<typeof buildNodeTree>['rows'],
  collapsedNodeIds: ReadonlySet<string>
) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredRows = useMemo(
    () => (searchQuery.trim() ? filterNodeTreeRowsByTitle(treeRows, searchQuery) : treeRows),
    [searchQuery, treeRows]
  );
  const visibleRows = useMemo(
    () => (searchQuery.trim() ? filteredRows : buildVisibleNodeTreeRows(filteredRows, collapsedNodeIds)),
    [collapsedNodeIds, filteredRows, searchQuery]
  );
  const collapsibleNodeIds = useMemo(
    () => treeRows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [treeRows]
  );

  return { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows };
}

export function toggleCollapsedNode(nodeId: string, setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>) {
  setCollapsedNodeIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
}
