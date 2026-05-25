import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import type { WorkspaceGridColumnProps } from './workspaceLayoutGridContentColumns';
import type { WorkspaceListAreaProps } from './WorkspaceLayoutGridSections';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import type { WorkspaceListSplitterProps } from './WorkspaceListSplitter';
import type { WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';
import type { WorkspaceRightSidebarSplitterProps } from './WorkspaceRightSidebarSplitter';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceGridContentProjectionSource = Pick<
  WorkspaceLayoutProps,
  'document' | 'externalLibrary' | 'layoutChrome' | 'navigation' | 'nodeList' | 'review' | 'trash' | 'virtualView'
>;

export function selectWorkspaceGridColumnProps({
  activeRightPanelId,
  documentNodeId,
  documentSurfaceProps,
  externalOutlineDocument,
  listNodesById,
  outlineActivePosition,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
  externalOutlineDocument: WorkspaceRightSidebarProps['outlineDocument'];
  listNodesById: WorkspaceListNodesById;
  outlineActivePosition: number;
  onSelectNode: WorkspaceLayoutProps['navigation']['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceGridColumnProps {
  return {
    documentSurfaceProps,
    isImmersiveMode: props.layoutChrome.isImmersiveMode,
    isListCollapsed: props.layoutChrome.isListCollapsed,
    isRightSidebarCollapsed: props.layoutChrome.isRightSidebarCollapsed,
    listAreaProps: selectWorkspaceListAreaProps({ listNodesById, onSelectNode, props }),
    listSplitterProps: selectWorkspaceListSplitterProps(props),
    rightSidebarProps: selectWorkspaceRightSidebarProps({
      activeRightPanelId,
      documentNodeId,
      externalOutlineDocument,
      outlineActivePosition,
      onSelectNode,
      props
    }),
    rightSidebarSplitterProps: selectWorkspaceRightSidebarSplitterProps(props),
    studySessionCompleteSummaryProps: selectStudySessionCompleteSummaryProps(props)
  };
}

function selectStudySessionCompleteSummaryProps(
  props: WorkspaceGridContentProjectionSource
): WorkspaceGridColumnProps['studySessionCompleteSummaryProps'] {
  if (!props.review.isStudyMode || props.review.reviewStatus !== 'completed') {
    return null;
  }
  return {
    completedAt: props.review.reviewSummary.completedAt,
    createdItemCount: props.review.reviewSummary.createdItemCount,
    createdTopicCount: props.review.reviewSummary.createdTopicCount,
    readingElapsedMs: props.review.reviewSummary.readingElapsedMs,
    readTopicCount: props.review.reviewSummary.readTopicCount,
    reviewElapsedMs: props.review.reviewSummary.reviewElapsedMs,
    reviewedItemCount: props.review.reviewSummary.reviewedItemCount,
    reviewSessionMode: props.review.reviewSessionMode,
    sessionStartedAt: props.review.reviewSummary.sessionStartedAt
  };
}

function selectWorkspaceListAreaProps({
  listNodesById,
  onSelectNode,
  props
}: {
  listNodesById: WorkspaceListNodesById;
  onSelectNode: WorkspaceLayoutProps['navigation']['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceListAreaProps {
  return {
    activeNodeId: props.navigation.activeNodeId,
    activeVirtualNodeId: props.virtualView.activeVirtualNodeId ?? null,
    externalEntriesByFolderId: props.externalLibrary.externalEntriesByFolderId,
    externalFolders: props.externalLibrary.externalFolders,
    externalSelection: props.externalLibrary.externalSelection,
    isExternalViewOpen: props.externalLibrary.isExternalViewOpen,
    isStudyMode: props.review.isStudyMode,
    isTrashViewOpen: props.trash.isTrashViewOpen,
    isVirtualViewOpen: props.virtualView.isVirtualViewOpen,
    listNodesById,
    nodesById: props.nodeList.nodesById,
    nodeOrder: props.nodeList.nodeOrder,
    onOpenMoveToNode: props.nodeList.onOpenMoveToNode,
    onOpenNotesView: props.nodeList.onOpenNotesView,
    onOpenExternalSelection: props.externalLibrary.onOpenExternalSelection,
    onOpenExternalLibrarySettings: props.externalLibrary.onOpenExternalLibrarySettings,
    onOpenTrashView: props.trash.onOpenTrashView,
    onOpenVirtualView: props.virtualView.onOpenVirtualView,
    onSelectNode,
    onSelectNodeInVirtualView: props.navigation.onSelectNodeInVirtualView,
    onSelectTrashNode: props.trash.onSelectTrashNode,
    reviewCurrentNodeId: props.review.reviewCurrentNodeId,
    selectedTrashNodeId: props.trash.selectedTrashNodeId,
    trashedNodeIds: props.trash.trashedNodeIds,
    ...definedProps({ isWorkspaceHydrated: props.layoutChrome.isWorkspaceHydrated })
  };
}

function selectWorkspaceListSplitterProps(
  props: WorkspaceGridContentProjectionSource
): WorkspaceListSplitterProps {
  return {
    isCollapsed: props.layoutChrome.isListCollapsed,
    isResizingList: props.layoutChrome.isResizingList,
    listWidth: props.layoutChrome.listWidth,
    onResetLayout: props.layoutChrome.onResetLayout,
    onSplitterKeyDown: props.layoutChrome.onSplitterKeyDown,
    onSplitterPointerDown: props.layoutChrome.onSplitterPointerDown
  };
}

function selectWorkspaceRightSidebarProps({
  activeRightPanelId,
  documentNodeId,
  externalOutlineDocument,
  outlineActivePosition,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  externalOutlineDocument: WorkspaceRightSidebarProps['outlineDocument'];
  outlineActivePosition: number;
  onSelectNode: WorkspaceLayoutProps['navigation']['onSelectNode'];
  props: WorkspaceGridContentProjectionSource;
}): WorkspaceRightSidebarProps {
  return {
    activePanelId: activeRightPanelId,
    activeNodeId: documentNodeId,
    outlineActivePosition,
    nodeOrder: props.nodeList.nodeOrder,
    nodesById: props.nodeList.nodesById,
    onRevealAnchorInDocument: props.document.onRevealAnchorInDocument,
    onRevealDocumentPosition: props.document.onRevealDocumentPosition,
    onSelectBreadcrumbNode: props.navigation.onSelectBreadcrumbNode,
    onSelectNode,
    reviewActiveQueueNodeIds: props.review.reviewQueueNodeIds,
    reviewCurrentNodeId: props.review.reviewCurrentNodeId,
    reviewQueueNodeIds: props.review.reviewPanelQueueNodeIds,
    reviewSchedulerSettings: props.review.reviewSchedulerSettings,
    trashedNodeIds: props.trash.trashedNodeIds,
    ...definedProps({ outlineDocument: externalOutlineDocument })
  };
}

function selectWorkspaceRightSidebarSplitterProps(
  props: WorkspaceGridContentProjectionSource
): WorkspaceRightSidebarSplitterProps {
  return {
    isCollapsed: props.layoutChrome.isRightSidebarCollapsed,
    isResizingRightSidebar: props.layoutChrome.isResizingRightSidebar,
    onResetLayout: props.layoutChrome.onResetLayout,
    onRightSidebarSplitterKeyDown: props.layoutChrome.onRightSidebarSplitterKeyDown,
    onRightSidebarSplitterPointerDown: props.layoutChrome.onRightSidebarSplitterPointerDown,
    rightSidebarWidth: props.layoutChrome.rightSidebarWidth
  };
}
