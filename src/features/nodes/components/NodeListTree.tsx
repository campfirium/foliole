import { useEffect, useMemo } from 'react';

import { onWindowKeydown } from '../../../shared/platform/keyboard';
import { useWorkspaceStore, type ReviewSessionState } from '../../../store/workspaceStore';
import { buildNodeTree } from '../model/nodeTree';
import { INBOX_NODE_ID, isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useCollapsedNodeState } from './NodeListCollapseState';
import { getNodeListRowSpacing } from './nodeListRowSpacingSettings';
import { NodeListTreeContent } from './NodeListTreeContent';
import { useNodeCollapseControls, useNodeListContextMenu } from './NodeListTreeHooks';
import { useNodeListState, useNodeSelectionHandler } from './NodeListTreeState';
import { useNodeBulkDeleteFeedback } from './useNodeBulkDeleteFeedback';

interface NodeListTreeProps {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenNotesView: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
}

interface NodeListTreeRuntimeState {
  reviewSession: ReviewSessionState;
}

interface NodeListTreeData {
  noteParentById: Record<string, string | null>;
  noteRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  trashRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  virtualRowsAll: ReturnType<typeof buildNodeTree>['rows'];
}

function useNodeWorkspaceActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    createRootNode: useWorkspaceStore((state) => state.createRootNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    relearnNode: useWorkspaceStore((state) => state.relearnNode),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds)
  };
}

function useNodeListTreeData(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: string[]
): NodeListTreeData {
  const virtualNodeOrder = useMemo(
    () => nodeOrder.filter((id) => !trashedNodeIds.includes(id) && isVirtualNode(nodesById[id])),
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
    () => nodeOrder.filter((id) => trashedNodeIds.includes(id)),
    [nodeOrder, trashedNodeIds]
  );
  const noteTree = useMemo(
    () => buildNodeTree(visibleNodeOrder, nodesById),
    [visibleNodeOrder, nodesById]
  );
  const trashTree = useMemo(
    () => buildNodeTree(trashedNodeOrder, nodesById),
    [trashedNodeOrder, nodesById]
  );
  const virtualTree = useMemo(
    () => buildNodeTree(virtualNodeOrder, nodesById),
    [virtualNodeOrder, nodesById]
  );

  return {
    noteParentById: noteTree.parentById,
    noteRowsAll: noteTree.rows,
    trashRowsAll: trashTree.rows,
    virtualRowsAll: virtualTree.rows
  };
}

function useNodeListTreeControllers(args: {
  activeNodeId: string | null;
  collapsedState: ReturnType<typeof useCollapsedNodeState>;
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
    setCollapsedTrashNodeIdList: args.collapsedState.setCollapsedTrashNodeIdList,
    toggleNoteCollapse: args.collapsedState.toggleNoteCollapse,
    trashRowsAll: args.trashRowsAll,
    trashedNodeIds: args.trashedNodeIds
  });
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId: args.activeNodeId,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    onSelectTrashNode: args.onSelectTrashNode,
    selectedTrashNodeId: args.selectedTrashNodeId,
    state: args.state,
    trashedNodeIds: args.trashedNodeIds
  });

  useEffect(
    () => onWindowKeydown((event) => event.key === 'Escape' && contextMenu.closeContextMenu()),
    []
  );

  return { collapse, contextMenu, handleSelectNode };
}

function useNodeListTreeModel({
  activeNodeId,
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
    nodeOrder,
    nodesById,
    selectedTrashNodeId,
    collapsedState.collapsedNoteNodeIds,
    collapsedState.collapsedTrashNodeIds
  );
  const controllers = useNodeListTreeControllers({
    activeNodeId,
    collapsedState,
    nodesById,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId,
    state,
    trashedNodeIds: workspace.trashedNodeIds,
    trashRowsAll: state.trashRowsAll
  });

  return {
    collapse: controllers.collapse,
    collapsedState,
    contextMenu: controllers.contextMenu,
    createChildNode: workspace.createChildNode,
    createGlobalNode: (content = '', kind: 'folder' | 'topic' | 'item' = 'topic') =>
      workspace.createChildNode(INBOX_NODE_ID, content, kind),
    createVirtualNode: workspace.createVirtualNode,
    deleteNodes: workspace.deleteNodes,
    deleteNodesPermanently: workspace.deleteNodesPermanently,
    dismissNode: workspace.dismissNode,
    handleSelectNode: controllers.handleSelectNode,
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
  isVirtualViewOpen,
  nodeOrder,
  nodesById,
  onOpenMoveToNode,
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
  const deleteFeedback = useNodeBulkDeleteFeedback(model.deleteNodes, model.deleteNodesPermanently);
  const rowSpacing = getNodeListRowSpacing();
  const collapsedNodeIds = isTrashViewOpen
    ? model.collapsedState.collapsedTrashNodeIds
    : model.collapsedState.collapsedNoteNodeIds;
  const activeRows = isTrashViewOpen ? state.trashRows : isVirtualViewOpen ? state.virtualRows : state.noteRows;

  return (
    <NodeListTreeContent
      activeCollapsedNodeIds={collapsedNodeIds}
      activeNodeId={activeNodeId}
      activeRows={activeRows}
      collapse={model.collapse}
      contextMenu={model.contextMenu}
      createChildNode={model.createChildNode}
      createGlobalNode={model.createGlobalNode}
      createVirtualNode={model.createVirtualNode}
      deleteStatusLabel={deleteFeedback.deleteStatusLabel}
      deleteNodes={deleteFeedback.runDeleteNodes}
      deleteNodesPermanently={deleteFeedback.runDeleteNodesPermanently}
      dismissNode={model.dismissNode}
      isTrashViewOpen={isTrashViewOpen}
      isVirtualViewOpen={isVirtualViewOpen}
      moveNodes={model.moveNodes}
      nodesById={nodesById}
      onOpenMoveToNode={onOpenMoveToNode}
      onOpenNotesView={onOpenNotesView}
      onSelect={model.handleSelectNode}
      reviewSession={runtimeState.reviewSession}
      rowSpacing={rowSpacing}
      returnNode={model.returnNode}
      updateNodeTitle={model.updateNodeTitle}
      restoreNode={model.restoreNode}
      selectedNodeIds={state.selectedNodeIds}
      selectedTrashNodeId={selectedTrashNodeId}
      state={state}
    />
  );
}
