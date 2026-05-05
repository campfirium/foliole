import { useEffect } from 'react';

import { onWindowKeydown } from '../../../shared/platform/keyboard';
import { useWorkspaceStore } from '../../../store/workspaceStore';
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

function useNodeListTreeModel({
  activeNodeId,
  nodeOrder,
  nodesById,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: Omit<NodeListTreeProps, 'isTrashViewOpen' | 'onOpenNotesView'>) {
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const deleteNodePermanently = useWorkspaceStore((state) => state.deleteNodePermanently);
  const restoreNode = useWorkspaceStore((state) => state.restoreNode);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const collapsedState = useCollapsedNodeState();
  const state = useNodeListState(
    activeNodeId,
    nodeOrder,
    nodesById,
    selectedTrashNodeId,
    collapsedState.collapsedNoteNodeIds,
    collapsedState.collapsedTrashNodeIds
  );
  const contextMenu = useNodeListContextMenu(state.selectedNodeIds, trashedNodeIds);
  const collapse = useNodeCollapseControls({
    activeNodeId,
    noteParentById: state.noteParentById,
    noteRowsAll: state.noteRowsAll,
    setCollapsedNoteNodeIdList: collapsedState.setCollapsedNoteNodeIdList,
    setCollapsedTrashNodeIdList: collapsedState.setCollapsedTrashNodeIdList,
    trashRowsAll: state.trashRowsAll,
    trashedNodeIds
  });
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId,
    state,
    trashedNodeIds
  });

  useEffect(
    () => onWindowKeydown((event) => event.key === 'Escape' && contextMenu.closeContextMenu()),
    []
  );

  return {
    collapse,
    collapsedState,
    contextMenu,
    createRootNode,
    deleteNode,
    deleteNodePermanently,
    handleSelectNode,
    restoreNode,
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
      createRootNode={model.createRootNode}
      deleteNode={model.deleteNode}
      deleteNodePermanently={model.deleteNodePermanently}
      isTrashViewOpen={isTrashViewOpen}
      onOpenNotesView={onOpenNotesView}
      onSelect={model.handleSelectNode}
      restoreNode={model.restoreNode}
      selectedNodeIds={state.selectedNodeIds}
      selectedTrashNodeId={selectedTrashNodeId}
      state={state}
    />
  );
}
