import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import {
  buildNodeTree,
  buildVisibleNodeTreeRows,
  collectNodeAncestorIds,
  filterNodeTreeRowsByTitle
} from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';
import { WorkspaceTopicTreeRows } from './WorkspaceTopicTreeRows';

interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onSelectNode: (nodeId: string) => void;
}

function useWorkspaceTopicTreeState(itemIds: string[], nodesById: WorkspaceListNodesById) {
  return useMemo(() => buildNodeTree(itemIds, nodesById), [itemIds, nodesById]);
}

function useWorkspaceTopicTreeActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode)
  };
}

function useWorkspaceTopicTreeInteraction(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onSelectNode: (nodeId: string) => void;
}) {
  const actions = useWorkspaceTopicTreeActions();
  const topicTreeState = useNodeListState(
    args.activeNodeId,
    true,
    args.itemIds,
    args.nodesById,
    null,
    args.collapsedNodeIds
  );
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId: args.activeNodeId,
    isSelectionScopeActive: true,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    onSelectTrashNode: () => undefined,
    selectedTrashNodeId: null,
    state: topicTreeState,
    trashedNodeIds: []
  });
  const contextMenu = useNodeListContextMenu(topicTreeState.selectedNodeIds, []);

  return {
    ...actions,
    contextMenu,
    handleSelectNode,
    topicTreeState,
    topicTreeMenu: (
      <NodeListTreeMenu
        contextMenu={contextMenu}
        createChildNode={actions.createChildNode}
        createGlobalNode={(content = '', kind = 'topic') => actions.createChildNode(args.activeFolderId, content, kind)}
        createVirtualNode={actions.createVirtualNode}
        deleteNodes={actions.deleteNodes}
        deleteNodesPermanently={actions.deleteNodesPermanently}
        dismissNode={actions.dismissNode}
        isVirtualViewOpen={false}
        nodesById={args.nodesById}
        onOpenMoveToNode={args.onOpenMoveToNode}
        onSelect={handleSelectNode}
        restoreNode={actions.restoreNode}
        returnNode={actions.returnNode}
        state={topicTreeState}
      />
    )
  };
}

function renderWorkspaceTopicTreeBody(args: {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  contextMenu: ReturnType<typeof useNodeListContextMenu>;
  emptyStateDescription: string;
  emptyStateTitle: string;
  nodesById: WorkspaceListNodesById;
  onSelectNode: ReturnType<typeof useNodeSelectionHandler>;
  onToggleCollapse: (nodeId: string) => void;
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
          onSelectNode={args.onSelectNode}
          onToggleCollapse={args.onToggleCollapse}
          rows={args.visibleRows}
        />
      )}
    </div>
  );
}

/**
 * Right-column item tree collapse rules live here.
 *
 * Rule 1: when `activeFolderId` changes, reset to "all collapsible nodes collapsed".
 * Rule 2: when `activeNodeId` changes to a topic/item in the current tree, expand its
 * ancestors and the target node itself.
 *
 * Manual toggle does not go through this hook. It mutates local state directly and is
 * only overwritten by Rule 1 when the active folder changes.
 *
 * If we later need a third input or source-specific navigation rules, re-evaluate
 * whether this should become a reducer.
 */
function useWorkspaceTopicTreeCollapse(
  activeFolderId: string,
  activeNodeId: string | null,
  treeRows: ReturnType<typeof buildNodeTree>['rows'],
  parentById: Record<string, string | null>
) {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const collapsibleNodeIds = useMemo(
    () => treeRows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [treeRows]
  );
  const treeRowById = useMemo(
    () => new Map(treeRows.map((row) => [row.node.id, row])),
    [treeRows]
  );

  useEffect(() => {
    setCollapsedNodeIds(new Set(collapsibleNodeIds));
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

function useWorkspaceTopicTreeRows(treeRows: ReturnType<typeof buildNodeTree>['rows'], collapsedNodeIds: ReadonlySet<string>) {
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

function toggleCollapsedNode(nodeId: string, setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>) {
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

export function WorkspaceTopicTree({
  activeFolderId,
  activeNodeId,
  emptyStateDescription = 'Select a folder with items, or add an item inside the current folder.',
  emptyStateTitle = 'No items in this folder',
  itemIds,
  nodesById,
  onOpenMoveToNode,
  onSelectNode
}: WorkspaceTopicTreeProps) {
  const tree = useWorkspaceTopicTreeState(itemIds, nodesById);
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeCollapse(
    activeFolderId,
    activeNodeId,
    tree.rows,
    tree.parentById
  );
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
  const hasCollapsedNodes =
    collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId,
    activeNodeId,
    collapsedNodeIds,
    itemIds,
    nodesById,
    onOpenMoveToNode,
    onSelectNode
  });

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <WorkspaceTopicTreeHeader
        hasCollapsibleNodes={collapsibleNodeIds.length > 0}
        hasCollapsedNodes={hasCollapsedNodes}
        onCreateTopic={() => interaction.createChildNode(activeFolderId, '', 'topic')}
        onToggleCollapseAll={() =>
          setCollapsedNodeIds(hasCollapsedNodes ? new Set() : new Set(collapsibleNodeIds))
        }
        onSearchQueryChange={setSearchQuery}
        searchQuery={searchQuery}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId,
        collapsedNodeIds,
        contextMenu: interaction.contextMenu,
        emptyStateDescription,
        emptyStateTitle,
        nodesById,
        onSelectNode: interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        visibleRows
      })}
      {interaction.topicTreeMenu}
    </aside>
  );
}
