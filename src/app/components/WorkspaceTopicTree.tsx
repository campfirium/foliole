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
    args.itemIds,
    args.nodesById,
    null,
    args.collapsedNodeIds,
    new Set()
  );
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId: args.activeNodeId,
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
  nodesById: WorkspaceListNodesById;
  onSelectNode: ReturnType<typeof useNodeSelectionHandler>;
  onToggleCollapse: (nodeId: string) => void;
  visibleRows: ReturnType<typeof buildVisibleNodeTreeRows>;
}) {
  return (
    <div
      className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg-panel px-2 pb-2 pt-2"
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
            description="Select a folder with topics, or add a topic inside the current folder."
            title="No topics in this folder"
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

function useWorkspaceTopicTreeCollapse(activeNodeId: string | null, parentById: Record<string, string | null>) {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!activeNodeId || !parentById[activeNodeId]) {
      return;
    }

    const ancestorIds = collectNodeAncestorIds(activeNodeId, parentById);
    setCollapsedNodeIds((current) => {
      if (ancestorIds.every((nodeId) => !current.has(nodeId))) {
        return current;
      }
      const next = new Set(current);
      ancestorIds.forEach((nodeId) => next.delete(nodeId));
      return next;
    });
  }, [activeNodeId, parentById]);

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
  itemIds,
  nodesById,
  onOpenMoveToNode,
  onSelectNode
}: WorkspaceTopicTreeProps) {
  const tree = useWorkspaceTopicTreeState(itemIds, nodesById);
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeCollapse(activeNodeId, tree.parentById);
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
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
    <aside aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <WorkspaceTopicTreeHeader
        onCollapseAll={() => setCollapsedNodeIds(new Set(collapsibleNodeIds))}
        onExpandAll={() => setCollapsedNodeIds(new Set())}
        onSearchQueryChange={setSearchQuery}
        searchQuery={searchQuery}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId,
        collapsedNodeIds,
        contextMenu: interaction.contextMenu,
        nodesById,
        onSelectNode: interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        visibleRows
      })}
      {interaction.topicTreeMenu}
    </aside>
  );
}
