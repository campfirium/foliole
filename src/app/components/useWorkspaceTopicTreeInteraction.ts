import { useMemo } from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import type { NodeListState } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import { useWorkspaceTopicTreeActions } from './workspaceTopicTreeActions';
import { useWorkspaceTopicTreeDrag } from './workspaceTopicTreeDrag';
import { renderWorkspaceTopicTreeMenu } from './workspaceTopicTreeMenuRender';
import { useWorkspaceTopicTreeSelection } from './workspaceTopicTreeSelection';

export type CreateTopicTreeNode = ReturnType<typeof useWorkspaceTopicTreeActions>['createChildNode'];

interface WorkspaceTopicTreeInteractionArgs {
  activeFolderId: string;
  activeNodeId: string | null;
  isManualSort: boolean;
  manualOrderIds: string[];
  virtualFolderView?: 'manual' | 'readonly';
  nodesById: WorkspaceListNodesById;
  onCreateChildNode?: CreateTopicTreeNode;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}

export function useWorkspaceTopicTreeInteraction(args: WorkspaceTopicTreeInteractionArgs) {
  const actions = useWorkspaceTopicTreeActions();
  const createChildNode = args.onCreateChildNode ?? actions.createChildNode;
  const selection = useWorkspaceTopicTreeSelection({
    activeNodeId: args.activeNodeId,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    rowIds: args.rowIds
  });
  const topicTreeState = useMemo<NodeListState>(() => ({
    noteParentById: {},
    noteRowIds: args.rowIds,
    noteRows: [],
    noteRowsAll: [],
    selectedNodeIds: selection.selectedNodeIds,
    selectionAnchorNodeId: selection.selectionAnchorNodeId,
    setSelectedNodeIds: selection.setSelectedNodeIds,
    setSelectionAnchorNodeId: selection.setSelectionAnchorNodeId,
    trashRowIds: [],
    trashRows: [],
    trashRowsAll: [],
    virtualRowIds: [],
    virtualRows: [],
    virtualRowsAll: []
  }), [args.rowIds, selection]);
  const contextMenu = useNodeListContextMenu(args.nodesById, selection.selectedNodeIds, []);
  const drag = useWorkspaceTopicTreeDrag({
    activeFolderId: args.activeFolderId,
    itemIds: args.rowIds,
    isManualSort: args.isManualSort,
    isVirtualFolderManualOrder: args.virtualFolderView === 'manual',
    manualOrderIds: args.manualOrderIds,
    moveNodes: actions.moveNodes,
    nodesById: args.nodesById,
    selectedNodeIds: selection.selectedNodeIds,
    ...definedProps({ setFolderManualChildOrder: actions.setFolderManualChildOrder })
  });

  return {
    ...actions,
    createChildNode,
    contextMenu,
    drag,
    handleSelectNode: selection.handleSelectNode,
    topicTreeState,
    topicTreeMenu: renderWorkspaceTopicTreeMenu({
      actions,
      activeFolderId: args.activeFolderId,
      contextMenu,
      handleSelectNode: selection.handleSelectNode,
      nodesById: args.nodesById,
      ...definedProps({ virtualFolderView: args.virtualFolderView }),
      onCreateChildNode: createChildNode,
      onOpenMoveToNode: args.onOpenMoveToNode,
      ...definedProps({ onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel }),
      topicTreeState
    })
  };
}
