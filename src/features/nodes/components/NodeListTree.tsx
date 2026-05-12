import { memo } from 'react';

import { getNodeListRowSpacing } from './nodeListRowSpacingSettings';
import { NodeListTreeContent } from './NodeListTreeContent';
import {
  type NodeListTreeProps,
  type NodeListTreeRuntimeState,
  useNodeListTreeModel
} from './nodeListTreeModel';
import { useNodeListTreeSelectionMetrics } from './nodeListTreeSelectionMetrics';
import { useNodeBulkDeleteFeedback } from './useNodeBulkDeleteFeedback';

function useNodeListTreeView(args: {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  model: ReturnType<typeof useNodeListTreeModel>;
}) {
  const rowSpacing = getNodeListRowSpacing();
  const collapsedNodeIds = args.isTrashViewOpen
    ? args.model.collapsedState.collapsedTrashNodeIds
    : args.model.collapsedState.collapsedNoteNodeIds;
  const activeRows = args.isTrashViewOpen
    ? args.model.state.trashRows
    : args.isVirtualViewOpen
      ? args.model.state.virtualRows
      : args.model.state.noteRows;
  return { activeRows, collapsedNodeIds, rowSpacing };
}

function buildNodeListTreeContentProps(args: {
  activeNodeId: string | null;
  activeRows: ReturnType<typeof useNodeListTreeView>['activeRows'];
  bodyAppendContent?: NodeListTreeProps['bodyAppendContent'];
  collapsedNodeIds: ReturnType<typeof useNodeListTreeView>['collapsedNodeIds'];
  deleteFeedback: ReturnType<typeof useNodeBulkDeleteFeedback>;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  model: ReturnType<typeof useNodeListTreeModel>;
  nodeOrder: NodeListTreeProps['nodeOrder'];
  nodesById: NodeListTreeProps['nodesById'];
  onOpenMoveToNode: NodeListTreeProps['onOpenMoveToNode'];
  onOpenNotesView: NodeListTreeProps['onOpenNotesView'];
  rowSpacing: number;
  runtimeState: NodeListTreeRuntimeState;
  selectedTrashNodeId: string | null;
  showVirtualCreateAction: boolean;
  showTitleSearch: boolean;
}) {
  return {
    activeCollapsedNodeIds: args.collapsedNodeIds,
    activeNodeId: args.activeNodeId,
    activeRows: args.activeRows,
    bodyAppendContent: args.bodyAppendContent,
    collapse: args.model.collapse,
    contextMenu: args.model.contextMenu,
    createChildNode: args.model.createChildNode,
    createGlobalNode: args.model.createGlobalNode,
    createVirtualNode: args.model.createVirtualNode,
    deleteNodes: args.deleteFeedback.runDeleteNodes,
    deleteNodesPermanently: args.deleteFeedback.runDeleteNodesPermanently,
    deleteStatusLabel: args.deleteFeedback.deleteStatusLabel,
    dismissNode: args.model.dismissNode,
    isTrashViewOpen: args.isTrashViewOpen,
    isVirtualViewOpen: args.isVirtualViewOpen,
    moveNodes: args.model.moveNodes,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    onOpenMoveToNode: args.onOpenMoveToNode,
    onOpenNotesView: args.onOpenNotesView,
    onSelect: args.model.handleSelectNode,
    restoreNode: args.model.restoreNode,
    returnNode: args.model.returnNode,
    reviewSession: args.runtimeState.reviewSession,
    rowSpacing: args.rowSpacing,
    selectedNodeIds: args.model.state.selectedNodeIds,
    selectedTrashNodeId: args.selectedTrashNodeId,
    showVirtualCreateAction: args.showVirtualCreateAction,
    showTitleSearch: args.showTitleSearch,
    state: args.model.state,
    trashedNodeIds: args.model.trashedNodeIds,
    updateNodeTitle: args.model.updateNodeTitle
  };
}

function useNodeListTreeSelectionDiagnostics(args: {
  activeNodeId: string | null;
  activeRowsLength: number;
  model: ReturnType<typeof useNodeListTreeModel>;
}) {
  useNodeListTreeSelectionMetrics({
    activeNodeId: args.activeNodeId,
    activeRowsLength: args.activeRowsLength,
    noteRowsAllLength: args.model.state.noteRowsAll.length,
    noteTreeBuildDurationMs: args.model.noteTreeBuildDurationMs,
    trashRowsAllLength: args.model.state.trashRowsAll.length,
    trashTreeBuildDurationMs: args.model.trashTreeBuildDurationMs,
    virtualRowsAllLength: args.model.state.virtualRowsAll.length,
    virtualTreeBuildDurationMs: args.model.virtualTreeBuildDurationMs
  });
}

function NodeListTreeImpl({
  activeNodeId,
  bodyAppendContent,
  isSelectionScopeActive = true,
  isTrashViewOpen,
  isVirtualViewOpen,
  nodeOrder,
  nodesById,
  onOpenMoveToNode,
  onOpenNotesView,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId,
  showVirtualCreateAction = true,
  showTitleSearch = true
}: NodeListTreeProps) {
  const model = useNodeListTreeModel({
    activeNodeId,
    isSelectionScopeActive,
    nodeOrder,
    nodesById,
    onSelectNode,
    onSelectTrashNode,
    selectedTrashNodeId
  });
  const runtimeState: NodeListTreeRuntimeState = { reviewSession: model.reviewSession };
  const deleteFeedback = useNodeBulkDeleteFeedback(model.deleteNodes, model.deleteNodesPermanently);
  const { activeRows, collapsedNodeIds, rowSpacing } = useNodeListTreeView({
    isTrashViewOpen,
    isVirtualViewOpen,
    model
  });
  useNodeListTreeSelectionDiagnostics({ activeNodeId, activeRowsLength: activeRows.length, model });
  const contentProps = buildNodeListTreeContentProps({
    activeNodeId,
    activeRows,
    bodyAppendContent,
    collapsedNodeIds,
    deleteFeedback,
    isTrashViewOpen,
    isVirtualViewOpen,
    model,
    nodeOrder,
    nodesById,
    onOpenMoveToNode,
    onOpenNotesView,
    rowSpacing,
    runtimeState,
    selectedTrashNodeId,
    showVirtualCreateAction,
    showTitleSearch
  });

  return <NodeListTreeContent {...contentProps} />;
}

export const NodeListTree = memo(NodeListTreeImpl);
