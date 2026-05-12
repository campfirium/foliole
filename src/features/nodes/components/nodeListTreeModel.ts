import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

import { onWindowKeydown } from '../../../shared/platform/keyboard';
import { useWorkspaceStore, type ReviewSessionState } from '../../../store/workspaceStore';
import { buildNodeTree } from '../model/nodeTree';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import { selectTrashRootIds } from '../model/trashRootModel';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useCollapsedNodeState } from './NodeListCollapseState';
import { useNodeCollapseControls, useNodeListContextMenu } from './NodeListTreeHooks';
import { useNodeListState, useNodeSelectionHandler } from './NodeListTreeState';

export interface NodeListTreeProps {
  activeNodeId: string | null;
  bodyAppendContent?: ReactNode;
  isSelectionScopeActive?: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  showVirtualCreateAction?: boolean;
  showTitleSearch?: boolean;
}

export interface NodeListTreeRuntimeState {
  reviewSession: ReviewSessionState;
}

interface NodeListTreeData {
  noteTreeBuildDurationMs: number;
  noteParentById: Record<string, string | null>;
  noteRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  trashTreeBuildDurationMs: number;
  trashRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  virtualTreeBuildDurationMs: number;
  virtualRowsAll: ReturnType<typeof buildNodeTree>['rows'];
}

function useNodeWorkspaceActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createRootNode: useWorkspaceStore((state) => state.createRootNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    relearnNode: useWorkspaceStore((state) => state.relearnNode),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle)
  };
}

function measureBuiltTree(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  const startedAt = performance.now();
  const tree = buildNodeTree(nodeIds, nodesById);
  return { durationMs: performance.now() - startedAt, tree };
}

function useNodeListTreeData(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: string[]
): NodeListTreeData {
  const virtualNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) =>
          id === VIRTUAL_ROOT_NODE_ID ||
          (!trashedNodeIds.includes(id) && isVirtualNode(nodesById[id]))
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const visibleNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) => !trashedNodeIds.includes(id) && !isVirtualRootNode(nodesById[id]) && !isVirtualNode(nodesById[id])
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const trashedNodeOrder = useMemo(
    () => selectTrashRootIds(nodeOrder, nodesById, trashedNodeIds),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const noteTree = useMemo(() => measureBuiltTree(visibleNodeOrder, nodesById), [visibleNodeOrder, nodesById]);
  const trashTree = useMemo(() => measureBuiltTree(trashedNodeOrder, nodesById), [trashedNodeOrder, nodesById]);
  const virtualTree = useMemo(() => measureBuiltTree(virtualNodeOrder, nodesById), [virtualNodeOrder, nodesById]);

  return {
    noteParentById: noteTree.tree.parentById,
    noteRowsAll: noteTree.tree.rows,
    noteTreeBuildDurationMs: noteTree.durationMs,
    trashRowsAll: trashTree.tree.rows,
    trashTreeBuildDurationMs: trashTree.durationMs,
    virtualRowsAll: virtualTree.tree.rows,
    virtualTreeBuildDurationMs: virtualTree.durationMs
  };
}

function useNodeListTreeControllers(args: {
  activeNodeId: string | null;
  collapsedState: ReturnType<typeof useCollapsedNodeState>;
  isSelectionScopeActive: boolean;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  state: ReturnType<typeof useNodeListState>;
  trashedNodeIds: string[];
  trashRowsAll: ReturnType<typeof buildNodeTree>['rows'];
}) {
  const contextMenu = useNodeListContextMenu(args.state.selectedNodeIds, args.trashedNodeIds);
  const collapse = useNodeCollapseControls({
    collapseAllNotes: args.collapsedState.collapseAllNotes,
    expandAllNotes: args.collapsedState.expandAllNotes,
    hasCollapsibleNotes: args.collapsedState.hasCollapsibleNotes,
    hasCollapsedNotes: args.collapsedState.hasCollapsedNotes,
    setCollapsedTrashNodeIdList: args.collapsedState.setCollapsedTrashNodeIdList,
    toggleNoteCollapse: args.collapsedState.toggleNoteCollapse,
    trashRowsAll: args.trashRowsAll,
    trashedNodeIds: args.trashedNodeIds
  });
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId: args.activeNodeId,
    isSelectionScopeActive: args.isSelectionScopeActive,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    onSelectTrashNode: args.onSelectTrashNode,
    selectedTrashNodeId: args.selectedTrashNodeId,
    state: args.state,
    trashedNodeIds: args.trashedNodeIds
  });

  useEffect(() => onWindowKeydown((event) => event.key === 'Escape' && contextMenu.closeContextMenu()), [contextMenu]);

  return { collapse, contextMenu, handleSelectNode };
}

export function useNodeListTreeModel({
  activeNodeId,
  isSelectionScopeActive = true,
  nodeOrder,
  nodesById,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: Omit<NodeListTreeProps, 'isTrashViewOpen' | 'isVirtualViewOpen' | 'onOpenMoveToNode' | 'onOpenNotesView'>) {
  const workspace = useNodeWorkspaceActions();
  const treeData = useNodeListTreeData(nodeOrder, nodesById, workspace.trashedNodeIds);
  const collapsedState = useCollapsedNodeState({
    activeNodeId,
    nodesById,
    noteParentById: treeData.noteParentById,
    noteRowsAll: treeData.noteRowsAll,
    trashRowsAll: treeData.trashRowsAll
  });
  const state = useNodeListState(
    activeNodeId,
    isSelectionScopeActive,
    nodeOrder,
    nodesById,
    selectedTrashNodeId,
    collapsedState.collapsedNoteNodeIds
  );
  const controllers = useNodeListTreeControllers({
    activeNodeId,
    collapsedState,
    isSelectionScopeActive,
    nodesById,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId,
    state,
    trashedNodeIds: workspace.trashedNodeIds,
    trashRowsAll: state.trashRowsAll
  });

  return buildNodeListTreeModelResult(workspace, treeData, controllers, collapsedState, state);
}

function buildNodeListTreeModelResult(
  workspace: ReturnType<typeof useNodeWorkspaceActions>,
  treeData: NodeListTreeData,
  controllers: ReturnType<typeof useNodeListTreeControllers>,
  collapsedState: ReturnType<typeof useCollapsedNodeState>,
  state: ReturnType<typeof useNodeListState>
) {
  return {
    collapse: controllers.collapse,
    collapsedState,
    contextMenu: controllers.contextMenu,
    createChildNode: workspace.createChildNode,
    createGlobalNode: (content = '', kind: 'folder' | 'topic' | 'item' = 'topic') =>
      workspace.createRootNode(content, kind),
    createVirtualNode: workspace.createVirtualNode,
    deleteNodes: workspace.deleteNodes,
    deleteNodesPermanently: workspace.deleteNodesPermanently,
    dismissNode: workspace.dismissNode,
    handleSelectNode: controllers.handleSelectNode,
    moveNodes: workspace.moveNodes,
    noteTreeBuildDurationMs: treeData.noteTreeBuildDurationMs,
    restoreNode: workspace.restoreNode,
    returnNode: workspace.relearnNode,
    reviewSession: workspace.reviewSession,
    state,
    trashedNodeIds: workspace.trashedNodeIds,
    trashTreeBuildDurationMs: treeData.trashTreeBuildDurationMs,
    updateNodeTitle: workspace.updateNodeTitle,
    virtualTreeBuildDurationMs: treeData.virtualTreeBuildDurationMs
  };
}
