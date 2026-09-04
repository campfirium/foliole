import { useRef } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic
} from '../../store/workspaceEditorInputDiagnostics';
import type { NodeViewState } from '../../store/workspaceStore';

import type { WorkspaceContentSortState } from './workspaceContentSort';
import type { WorkspaceTopicTreeProps } from './WorkspaceTopicTree';
import type { TopicChildrenByParent } from './workspaceTopicTreeLazyRows';

interface WorkspaceTopicTreeDiagnosticData {
  contentSort: { sort: WorkspaceContentSortState };
  lazyModel: { rows: readonly unknown[] };
  nodeViewById: Record<string, NodeViewState | undefined>;
}

interface WorkspaceTopicTreePreviousRender {
  activeNodeUpdatedAt: string | null;
  childrenByParent: TopicChildrenByParent | undefined;
  itemIds: string[];
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceTopicTreeProps['onOpenMoveToNode'];
  onOpenPostponeTopicPanel: WorkspaceTopicTreeProps['onOpenPostponeTopicPanel'];
  onSelectNode: WorkspaceTopicTreeProps['onSelectNode'];
}

export function areWorkspaceTopicTreePropsEqual(
  previous: WorkspaceTopicTreeProps,
  next: WorkspaceTopicTreeProps
) {
  const changed = {
    activeFolderId: previous.activeFolderId !== next.activeFolderId,
    activeNodeId: previous.activeNodeId !== next.activeNodeId,
    childrenByParent: previous.childrenByParent !== next.childrenByParent,
    creationParentNodeId: previous.creationParentNodeId !== next.creationParentNodeId,
    emptyState: previous.emptyState !== next.emptyState,
    forceVisibleNodeId: previous.forceVisibleNodeId !== next.forceVisibleNodeId,
    headerDescription: previous.headerDescription !== next.headerDescription,
    itemIds: previous.itemIds !== next.itemIds,
    virtualFolderView: previous.virtualFolderView !== next.virtualFolderView,
    preserveItemOrder: previous.preserveItemOrder !== next.preserveItemOrder,
    nodesById: previous.nodesById !== next.nodesById,
    onOpenMoveToNode: previous.onOpenMoveToNode !== next.onOpenMoveToNode,
    onFocusEditor: previous.onFocusEditor !== next.onFocusEditor,
    onOpenPostponeTopicPanel: previous.onOpenPostponeTopicPanel !== next.onOpenPostponeTopicPanel,
    onSelectNode: previous.onSelectNode !== next.onSelectNode,
    showCreateTopic: previous.showCreateTopic !== next.showCreateTopic,
    topicFocusAvailable: previous.topicFocusAvailable !== next.topicFocusAvailable
  };
  if (isEditorInputDiagnosticEnabled()) {
    logEditorInputDiagnostic('workspace-topic-tree-memo-compare', changed);
  }
  return !Object.values(changed).some(Boolean);
}

export function useWorkspaceTopicTreeRenderDiagnostic(
  props: WorkspaceTopicTreeProps,
  data: WorkspaceTopicTreeDiagnosticData
) {
  const previousRef = useRef<WorkspaceTopicTreePreviousRender | null>(null);
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  const activeNodeUpdatedAt = props.activeNodeId
    ? props.nodesById[props.activeNodeId]?.updatedAt ?? null
    : null;
  const previous = previousRef.current;
  logEditorInputDiagnostic('workspace-topic-tree-render', {
    activeNodeId: props.activeNodeId,
    activeNodeUpdatedAt,
    childrenByParentChanged: Boolean(previous && previous.childrenByParent !== props.childrenByParent),
    itemIdsChanged: Boolean(previous && previous.itemIds !== props.itemIds),
    nodeViewByIdChanged: Boolean(previous && previous.nodeViewById !== data.nodeViewById),
    nodesByIdChanged: Boolean(previous && previous.nodesById !== props.nodesById),
    onOpenMoveToNodeChanged: Boolean(previous && previous.onOpenMoveToNode !== props.onOpenMoveToNode),
    onOpenPostponeTopicPanelChanged: Boolean(previous && previous.onOpenPostponeTopicPanel !== props.onOpenPostponeTopicPanel),
    onSelectNodeChanged: Boolean(previous && previous.onSelectNode !== props.onSelectNode),
    previousActiveNodeUpdatedAt: previous?.activeNodeUpdatedAt ?? null,
    rowsLength: data.lazyModel.rows.length,
    sortKey: data.contentSort.sort.key
  });
  previousRef.current = {
    activeNodeUpdatedAt,
    childrenByParent: props.childrenByParent,
    itemIds: props.itemIds,
    nodeViewById: data.nodeViewById,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onOpenPostponeTopicPanel: props.onOpenPostponeTopicPanel,
    onSelectNode: props.onSelectNode
  };
}
