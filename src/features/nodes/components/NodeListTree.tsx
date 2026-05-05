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
  collapsedNodeIds: ReturnType<typeof useNodeListTreeView>['collapsedNodeIds'];
  deleteFeedback: ReturnType<typeof useNodeBulkDeleteFeedback>;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  model: ReturnType<typeof useNodeListTreeModel>;
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
    updateNodeTitle: args.model.updateNodeTitle
  };
}

function NodeListTreeImpl({
  activeNodeId,
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

  useNodeListTreeSelectionMetrics({
    activeNodeId,
    activeRowsLength: activeRows.length,
    noteRowsAllLength: model.state.noteRowsAll.length,
    noteTreeBuildDurationMs: model.noteTreeBuildDurationMs,
    trashRowsAllLength: model.state.trashRowsAll.length,
    trashTreeBuildDurationMs: model.trashTreeBuildDurationMs,
    virtualRowsAllLength: model.state.virtualRowsAll.length,
    virtualTreeBuildDurationMs: model.virtualTreeBuildDurationMs
  });
  const contentProps = buildNodeListTreeContentProps({
    activeNodeId,
    activeRows,
    collapsedNodeIds,
    deleteFeedback,
    isTrashViewOpen,
    isVirtualViewOpen,
    model,
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
