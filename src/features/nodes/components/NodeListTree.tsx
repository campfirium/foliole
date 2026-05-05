import { useEffect } from 'react';

import { onWindowKeydown } from '../../../shared/platform/keyboard';
import { useWorkspaceStore, type ReviewSessionState } from '../../../store/workspaceStore';
import type { Node } from '../model/nodeTypes';

import { NodeListTreeContent } from './NodeListTreeContent';
import { useNodeCollapseControls, useNodeListContextMenu } from './NodeListTreeHooks';
import {
  useCollapsedNodeState,
  useNodeListState,
  useNodeSelectionHandler
} from './NodeListTreeState';

interface NodeListTreeProps {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
}

interface NodeListTreeRuntimeState {
  reviewSession: ReviewSessionState;
}

function useNodeWorkspaceActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createRootNode: useWorkspaceStore((state) => state.createRootNode),
    deleteNode: useWorkspaceStore((state) => state.deleteNode),
    deleteNodePermanently: useWorkspaceStore((state) => state.deleteNodePermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    relearnNode: useWorkspaceStore((state) => state.relearnNode),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds)
  };
}

function useNodeListTreeModel({
  activeNodeId,
  nodeOrder,
  nodesById,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: Omit<NodeListTreeProps, 'isTrashViewOpen' | 'onOpenNotesView'>) {
  const workspace = useNodeWorkspaceActions();
  const collapsedState = useCollapsedNodeState();
  const state = useNodeListState(
    activeNodeId,
    nodeOrder,
    nodesById,
    selectedTrashNodeId,
    collapsedState.collapsedNoteNodeIds,
    collapsedState.collapsedTrashNodeIds
  );
  const contextMenu = useNodeListContextMenu(state.selectedNodeIds, workspace.trashedNodeIds);
  const collapse = useNodeCollapseControls({
    activeNodeId,
    noteParentById: state.noteParentById,
    noteRowsAll: state.noteRowsAll,
    setCollapsedNoteNodeIdList: collapsedState.setCollapsedNoteNodeIdList,
    setCollapsedTrashNodeIdList: collapsedState.setCollapsedTrashNodeIdList,
    trashRowsAll: state.trashRowsAll,
    trashedNodeIds: workspace.trashedNodeIds
  });
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId,
    state,
    trashedNodeIds: workspace.trashedNodeIds
  });

  useEffect(
    () => onWindowKeydown((event) => event.key === 'Escape' && contextMenu.closeContextMenu()),
    []
  );

  return {
    collapse,
    collapsedState,
    contextMenu,
    createChildNode: workspace.createChildNode,
    createRootNode: workspace.createRootNode,
    deleteNode: workspace.deleteNode,
    deleteNodePermanently: workspace.deleteNodePermanently,
    dismissNode: workspace.dismissNode,
    handleSelectNode,
    moveNodes: workspace.moveNodes,
    returnNode: workspace.relearnNode,
    reviewSession: workspace.reviewSession,
    restoreNode: workspace.restoreNode,
    updateNodeTitle: workspace.updateNodeTitle,
    state
  };
}

export function NodeListTree({
  activeNodeId,
  isTrashViewOpen,
  nodeOrder,
  nodesById,
  onOpenNotesView,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: NodeListTreeProps) {
  const model = useNodeListTreeModel({
    activeNodeId,
    nodeOrder,
    nodesById,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId
  });
  const state = model.state;
  const runtimeState: NodeListTreeRuntimeState = { reviewSession: model.reviewSession };
  const collapsedNodeIds = isTrashViewOpen
    ? model.collapsedState.collapsedTrashNodeIds
    : model.collapsedState.collapsedNoteNodeIds;
  const activeRows = isTrashViewOpen ? state.trashRows : state.noteRows;

  return (
    <NodeListTreeContent
      activeCollapsedNodeIds={collapsedNodeIds}
      activeNodeId={activeNodeId}
      activeRows={activeRows}
      collapse={model.collapse}
      contextMenu={model.contextMenu}
      createChildNode={model.createChildNode}
      createRootNode={model.createRootNode}
      deleteNode={model.deleteNode}
      deleteNodePermanently={model.deleteNodePermanently}
      dismissNode={model.dismissNode}
      isTrashViewOpen={isTrashViewOpen}
      moveNodes={model.moveNodes}
      nodesById={nodesById}
      onOpenNotesView={onOpenNotesView}
      onSelect={model.handleSelectNode}
      reviewSession={runtimeState.reviewSession}
      returnNode={model.returnNode}
      updateNodeTitle={model.updateNodeTitle}
      restoreNode={model.restoreNode}
      selectedNodeIds={state.selectedNodeIds}
      selectedTrashNodeId={selectedTrashNodeId}
      state={state}
    />
  );
}
