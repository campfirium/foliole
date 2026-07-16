import { memo } from 'react';

import { useOptionalAppearanceSettings } from '../../settings/context/AppearanceSettingsProvider';

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
  const appearanceSettings = useOptionalAppearanceSettings();
  const rowSpacing = appearanceSettings?.nodeListRowSpacing ?? getNodeListRowSpacing();
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

interface NodeListTreeContentPropsArgs {
  activeNodeId: string | null;
  activeRows: ReturnType<typeof useNodeListTreeView>['activeRows'];
  bodyAppendContent?: NodeListTreeProps['bodyAppendContent'];
  collapsedNodeIds: ReturnType<typeof useNodeListTreeView>['collapsedNodeIds'];
  deleteFeedback: ReturnType<typeof useNodeBulkDeleteFeedback>;
  highlightedNodeId?: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  model: ReturnType<typeof useNodeListTreeModel>;
  nodeOrder: NodeListTreeProps['nodeOrder'];
  nodesById: NodeListTreeProps['nodesById'];
  onOpenMoveToNode: NodeListTreeProps['onOpenMoveToNode'];
  onOpenNotesView: NodeListTreeProps['onOpenNotesView'];
  rowCountByNodeId?: NodeListTreeProps['rowCountByNodeId'] | undefined;
  rowSpacing: number;
  runtimeState: NodeListTreeRuntimeState;
  selectedTrashNodeId: string | null;
  scrollTargetNodeId: string | null;
  showVirtualCreateAction: boolean;
  showTitleSearch: boolean;
  virtualizeRows: boolean;
}

function buildNodeListTreeContentProps(args: NodeListTreeContentPropsArgs) {
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
    highlightedNodeId: args.highlightedNodeId ?? null,
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
    rowCountByNodeId: args.rowCountByNodeId,
    rowSpacing: args.rowSpacing,
    scrollTargetNodeId: args.scrollTargetNodeId,
    selectedNodeIds: args.model.state.selectedNodeIds,
    selectedTrashNodeId: args.selectedTrashNodeId,
    setNodeSequentialReading: args.model.setNodeSequentialReading,
    shelveNode: args.model.shelveNode,
    showVirtualCreateAction: args.showVirtualCreateAction,
    showTitleSearch: args.showTitleSearch,
    state: args.model.state,
    trashedNodeIds: args.model.trashedNodeIds,
    updateNodePriority: args.model.updateNodePriority,
    updateNodeShortTerm: args.model.updateNodeShortTerm,
    updateNodeTitle: args.model.updateNodeTitle,
    unshelveNode: args.model.unshelveNode,
    virtualizeRows: args.virtualizeRows
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

function usePreparedNodeListTreeContentProps(props: NodeListTreeProps) {
  const model = useNodeListTreeModel({
    activeNodeId: props.activeNodeId,
    forceExpandedNodeId: props.forceExpandedNodeId ?? null,
    isSelectionScopeActive: props.isSelectionScopeActive ?? true,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onSelectNode: props.onSelectNode,
    onSelectTrashNode: props.onSelectTrashNode,
    selectedTrashNodeId: props.selectedTrashNodeId
  });
  const deleteFeedback = useNodeBulkDeleteFeedback(model.deleteNodes, model.deleteNodesPermanently);
  const { activeRows, collapsedNodeIds, rowSpacing } = useNodeListTreeView({
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    model
  });
  useNodeListTreeSelectionDiagnostics({ activeNodeId: props.activeNodeId, activeRowsLength: activeRows.length, model });
  return buildNodeListTreeContentProps({
    activeNodeId: props.activeNodeId,
    activeRows,
    bodyAppendContent: props.bodyAppendContent,
    collapsedNodeIds,
    deleteFeedback,
    highlightedNodeId: props.highlightedNodeId ?? null,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    model,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onOpenNotesView: props.onOpenNotesView,
    rowSpacing,
    runtimeState: { reviewSession: model.reviewSession },
    rowCountByNodeId: props.rowCountByNodeId,
    scrollTargetNodeId: props.scrollTargetNodeId ?? null,
    selectedTrashNodeId: props.selectedTrashNodeId,
    showVirtualCreateAction: props.showVirtualCreateAction ?? true,
    showTitleSearch: props.showTitleSearch ?? true,
    virtualizeRows: props.virtualizeRows ?? true
  });
}

function NodeListTreeImpl(props: NodeListTreeProps) {
  const contentProps = usePreparedNodeListTreeContentProps(props);
  return <NodeListTreeContent {...contentProps} />;
}

export const NodeListTree = memo(NodeListTreeImpl);
