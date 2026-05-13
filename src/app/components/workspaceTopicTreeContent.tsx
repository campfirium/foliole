import { useCallback, useMemo, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from 'react';

import type { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
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
  drag: ReturnType<typeof useNodeListDragController>;
  emptyStateDescription: string;
  emptyStateTitle: string;
  nodesById: WorkspaceListNodesById;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: ReturnType<typeof useNodeSelectionHandler>;
  onToggleCollapse: (nodeId: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectedNodeIds: string[];
  visibleRows: ReturnType<typeof buildVisibleNodeTreeRows>;
}) {
  return (
    <div
      className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-2"
      ref={args.scrollContainerRef as RefObject<HTMLDivElement>}
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
          drag={args.drag}
          nodesById={args.nodesById}
          onContextMenu={args.contextMenu.openContextMenu}
          onRenameNode={args.onRenameNode}
          onSelectNode={args.onSelectNode}
          onToggleCollapse={args.onToggleCollapse}
          rows={args.visibleRows}
          scrollContainerRef={args.scrollContainerRef}
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
  const collapsibleNodeIds = useMemo(
    () => treeRows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [treeRows]
  );
  const treeRowById = useMemo(
    () => new Map(treeRows.map((row) => [row.node.id, row])),
    [treeRows]
  );
  const expandedNodeIds = useMemo(
    () => collectExpandedNodeIds(activeNodeId, treeRowById, parentById),
    [activeNodeId, parentById, treeRowById]
  );
  const [collapseState, setCollapseState] = useState(() => createInitialCollapseState(
    activeFolderId,
    collapsibleNodeIds,
    expandedNodeIds
  ));
  const syncedState = syncCollapseState({
    activeFolderId,
    activeNodeId,
    collapsibleNodeIds,
    collapseState,
    expandedNodeIds
  });

  if (syncedState !== collapseState) {
    setCollapseState(syncedState);
  }

  const setCollapsedNodeIds = useCallback<Dispatch<SetStateAction<Set<string>>>>((value) => {
    setCollapseState((current) => ({
      activeFolderId: current.activeFolderId,
      activeNodeId: current.activeNodeId,
      collapsedNodeIds: typeof value === 'function' ? value(current.collapsedNodeIds) : value
    }));
  }, []);

  return { collapsedNodeIds: syncedState.collapsedNodeIds, setCollapsedNodeIds };
}

interface CollapseState {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: Set<string>;
}

function collectExpandedNodeIds(
  activeNodeId: string | null,
  treeRowById: Map<string, ReturnType<typeof buildNodeTree>['rows'][number]>,
  parentById: Record<string, string | null>
) {
  const expandedNodeIds = new Set<string>();
  if (!activeNodeId) {
    return expandedNodeIds;
  }
  const activeRow = treeRowById.get(activeNodeId);
  if (!activeRow || activeRow.node.kind === 'folder') {
    return expandedNodeIds;
  }
  collectNodeAncestorIds(activeNodeId, parentById).forEach((nodeId) => expandedNodeIds.add(nodeId));
  return expandedNodeIds;
}

function createCollapsedNodeIds(collapsibleNodeIds: readonly string[], expandedNodeIds: ReadonlySet<string>) {
  return new Set(collapsibleNodeIds.filter((nodeId) => !expandedNodeIds.has(nodeId)));
}

function createInitialCollapseState(
  activeFolderId: string,
  collapsibleNodeIds: readonly string[],
  expandedNodeIds: ReadonlySet<string>
): CollapseState {
  return {
    activeFolderId,
    activeNodeId: null,
    collapsedNodeIds: createCollapsedNodeIds(collapsibleNodeIds, expandedNodeIds)
  };
}

function pruneCollapsedNodeIds(current: ReadonlySet<string>, collapsibleNodeIds: readonly string[]) {
  const validNodeIds = new Set(collapsibleNodeIds);
  const next = new Set([...current].filter((nodeId) => validNodeIds.has(nodeId)));
  return next.size === current.size ? current : next;
}

function syncExpandedNodeIds(current: ReadonlySet<string>, expandedNodeIds: ReadonlySet<string>) {
  if ([...expandedNodeIds].every((nodeId) => !current.has(nodeId))) {
    return current;
  }
  const next = new Set(current);
  expandedNodeIds.forEach((nodeId) => next.delete(nodeId));
  return next;
}

function syncCollapseState(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsibleNodeIds: readonly string[];
  collapseState: CollapseState;
  expandedNodeIds: ReadonlySet<string>;
}) {
  if (args.collapseState.activeFolderId !== args.activeFolderId) {
    return {
      ...createInitialCollapseState(args.activeFolderId, args.collapsibleNodeIds, args.expandedNodeIds),
      activeNodeId: args.activeNodeId
    };
  }
  const pruned = pruneCollapsedNodeIds(args.collapseState.collapsedNodeIds, args.collapsibleNodeIds);
  const shouldAutoExpand = args.collapseState.activeNodeId !== args.activeNodeId;
  const expanded = shouldAutoExpand ? syncExpandedNodeIds(pruned, args.expandedNodeIds) : pruned;
  if (
    args.collapseState.activeNodeId === args.activeNodeId &&
    pruned === args.collapseState.collapsedNodeIds &&
    expanded === pruned
  ) {
    return args.collapseState;
  }
  return {
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    collapsedNodeIds: new Set(expanded)
  };
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
