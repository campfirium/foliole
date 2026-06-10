import { definedProps } from '../../shared/lib/definedProps';

import type { SelectNodeHandler } from './appControllerEditorHandlers';
import { createLayoutEditorCtx, resolveEditorBindingArgs } from './appControllerLayoutContext';
import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { createLayoutNav, resolveLayoutCanGoBack, resolveLayoutCanGoForward } from './appControllerNavHandlers';

export function createLayoutDataArgs(
  args: BuildControllerLayoutPropsArgs,
  onSelectNode: SelectNodeHandler
) {
  const editorCtx = createLayoutEditorCtx(args);
  const nav = createLayoutNav(args, onSelectNode);
  return {
    activeNodeId: args.ws.activeNodeId,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    reviewSettings: args.reviewSettings,
    canGoBack: resolveLayoutCanGoBack(args),
    canGoForward: resolveLayoutCanGoForward(args),
    canGoParent: args.nav.canGoParent,
    canStartStudyMode: args.canStartStudyMode,
    contextMenu: args.editorCtx.contextMenu,
    editorAdapterRef: args.runtime.editorRef,
    ...resolveEditorBindingArgs(args),
    ...definedProps({ documentNode: args.runtime.isViewingTrashNode ? args.selectedTrashNode : args.activeNode }),
    isResizingList: args.listResize.isResizingList,
    isResizingRightSidebar: args.rightSidebarResize.isResizingRightSidebar,
    isSettingsOpen: args.runtime.isSettingsOpen,
    isStudyMode: args.isStudyMode,
    isReviewEditing: args.isReviewEditing,
    isImportManagementOpen: args.runtime.isImportManagementOpen,
    isImmersiveMode: args.runtime.isImmersiveMode,
    isPriorityQuickSetActive: args.priorityQuickSet.isActive,
    isListCollapsed: args.ws.isListCollapsed,
    isRightSidebarCollapsed: args.ws.isRightSidebarCollapsed,
    requestedSettingsCategory: args.runtime.requestedSettingsCategory,
    requestedSettingsDialog: args.runtime.requestedSettingsDialog,
    ...createLayoutViewState(args),
    ...createLayoutReviewData(args),
    nav,
    editorCtx
  };
}

function createLayoutViewState(args: BuildControllerLayoutPropsArgs) {
  return {
    activeVirtualNodeId: args.virtualView.activeVirtualNodeId,
    isExternalViewOpen: args.externalView.isExternalViewOpen,
    isTrashViewOpen: args.trash.isTrashViewOpen,
    isViewingTrashNode: args.runtime.isViewingTrashNode,
    isVirtualViewOpen: args.virtualView.isVirtualViewOpen,
    listWidth: args.ws.listWidth,
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    externalFolders: args.externalView.folders,
    externalEntriesByFolderId: args.externalView.entriesByFolderId,
    externalSelection: args.externalView.selection,
    nodeViewById: args.ws.nodeViewById,
    rightSidebarWidth: args.ws.rightSidebarWidth,
    selectedTrashNodeId: args.trash.selectedTrashNodeId,
    trashedNodeIds: args.ws.trashedNodeIds
  };
}

function createLayoutReviewData(args: BuildControllerLayoutPropsArgs) {
  return {
    readReviewTopic: args.ws.readReviewTopic,
    postponeReviewTopic: args.ws.postponeReviewTopic,
    dismissReviewTopic: args.ws.dismissReviewTopic,
    revisitReviewTopicSoon: args.ws.revisitReviewTopicSoon,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.exitStudyMode,
    nowIso: args.nowIso,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    reviewPreview: args.reviewPreview,
    reviewSession: args.ws.reviewSession,
    reviewSessionMode: args.ws.reviewSessionMode,
    onResumeReviewItem: args.resumeReviewItem,
    setReviewSessionMode: args.ws.setReviewSessionMode,
    showAnswerSection: !args.isStudyMode || args.ws.reviewSession.isAnswerRevealed,
    startReviewSession: args.ws.startReviewSession,
    startStudyMode: args.startStudyMode
  };
}
