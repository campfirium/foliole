import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { onWindowEscape } from '../../../shared/platform/keyboard';
import { useWorkspaceStore, type ReviewSessionState } from '../../../store/workspaceStore';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useCollapsedNodeState } from './NodeListCollapseState';
import { useNodeSelectionHandler } from './NodeListSelection';
import { useNodeListTreeData, type NodeListTreeData } from './NodeListTreeData';
import { useNodeCollapseControls, useNodeListContextMenu } from './NodeListTreeHooks';
import { useNodeListState } from './NodeListTreeState';

export interface NodeListTreeProps {
  activeNodeId: string | null;
  bodyAppendContent?: ReactNode;
  forceExpandedNodeId?: string | null;
  highlightedNodeId?: string | null;
  rowCountByNodeId?: ReadonlyMap<string, number>;
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
    setNodeSequentialReading: useWorkspaceStore((state) => state.setNodeSequentialReading),
    shelveNode: useWorkspaceStore((state) => state.shelveNode),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds),
    unshelveNode: useWorkspaceStore((state) => state.unshelveNode),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
    updateNodeShortTerm: useWorkspaceStore((state) => state.updateNodeShortTerm),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle)
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
  trashRowsAll: NodeListTreeData['trashRowsAll'];
}) {
  const contextMenu = useNodeListContextMenu(args.nodesById, args.state.selectedNodeIds, args.trashedNodeIds);
  const collapse = useNodeCollapseControls({
    collapseAllNotes: args.collapsedState.collapseAllNotes,
    expandNoteCollapse: args.collapsedState.expandNoteCollapse,
    expandAllNotes: args.collapsedState.expandAllNotes,
    hasCollapsibleNotes: args.collapsedState.hasCollapsibleNotes,
    hasCollapsedNotes: args.collapsedState.hasCollapsedNotes,
    nodesById: args.nodesById,
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

  useEffect(() => onWindowEscape(contextMenu.closeContextMenu), [contextMenu]);

  return { collapse, contextMenu, handleSelectNode };
}

export function useNodeListTreeModel({
  activeNodeId,
  forceExpandedNodeId,
  isSelectionScopeActive = true,
  nodeOrder,
  nodesById,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: Omit<NodeListTreeProps, 'highlightedNodeId' | 'isTrashViewOpen' | 'isVirtualViewOpen' | 'onOpenMoveToNode' | 'onOpenNotesView'>) {
  const workspace = useNodeWorkspaceActions();
  const treeData = useNodeListTreeData(nodeOrder, nodesById, workspace.trashedNodeIds);
  const collapsedState = useCollapsedNodeState({
    activeNodeId,
    forceExpandedNodeId: forceExpandedNodeId ?? null,
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
    setNodeSequentialReading: workspace.setNodeSequentialReading,
    shelveNode: workspace.shelveNode,
    state,
    trashedNodeIds: workspace.trashedNodeIds,
    trashTreeBuildDurationMs: treeData.trashTreeBuildDurationMs,
    updateNodePriority: workspace.updateNodePriority,
    updateNodeShortTerm: workspace.updateNodeShortTerm,
    updateNodeTitle: workspace.updateNodeTitle,
    unshelveNode: workspace.unshelveNode,
    virtualTreeBuildDurationMs: treeData.virtualTreeBuildDurationMs
  };
}
