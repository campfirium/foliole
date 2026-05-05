import type { NodeKind } from '../../../lib/core/nodes/nodeKind';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettingsContextValue } from '../../features/settings/context/reviewSchedulerSettingsContext';
import type { NodeViewState, ReviewSessionState } from '../../store/workspaceStore';

import type { useCurrentReviewPreview } from './appControllerHelpers';
import { createLayoutEditorCtx, isVirtualEditorNode, resolveEditorBindingArgs } from './appControllerLayoutContext';
import { createLayoutNav, createSelectTrashNodeHandler } from './appControllerNavHandlers';
import { createPastedTextAnchorsHandler } from './appControllerPastedTextAnchors';
import { createReadingPositionHandlers } from './appControllerReadingPosition';
import {
  createPersistPdfViewState,
  createRevealAnchorInDocument,
  createRevealDocumentPosition,
  createRevealDocumentSelection,
  createResolveDocumentPositionAtViewportY,
  createToggleListVisibility,
  createToggleRightSidebarVisibility
} from './appControllerRuntimeActions';
import { createOpenNotesView, createSelectNode, createToggleTrashView, createToggleVirtualView } from './appControllerTrashViewHandlers';
import { buildLayoutProps } from './layoutPropsBuilder';
import { createCloseSettingsHandler, createOpenSettingsHandler } from './settingsOverlayRequest';
import type { useAppRuntime } from './useAppRuntime';
import type { useDocumentWidthResizer } from './useDocumentWidthResizer';
import type { useEditorContextCommands } from './useEditorContextCommands';
import type { useListResizer } from './useListResizer';
import type { useRightSidebarResizer } from './useRightSidebarResizer';
import type { useTrashView } from './useTrashView';
import type { useVirtualNodeView } from './useVirtualNodeView';
import type { useWorkspaceNavigation } from './useWorkspaceNavigation';

export interface BuildControllerLayoutPropsArgs {
  activeNode: Node | undefined;
  canStartStudyMode: boolean;
  documentResize: ReturnType<typeof useDocumentWidthResizer>;
  editorCtx: ReturnType<typeof useEditorContextCommands>;
  exitStudyMode: () => void;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  priorityQuickSet: {
    enter: () => boolean;
    isActive: boolean;
    shortcutLabel: string;
  };
  listResize: ReturnType<typeof useListResizer>;
  nav: ReturnType<typeof useWorkspaceNavigation>;
  nowIso: string;
  reviewDueCount: number;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReviewSchedulerSettingsContextValue;
  rightSidebarResize: ReturnType<typeof useRightSidebarResizer>;
  runtime: ReturnType<typeof useAppRuntime>;
  selectedTrashNode: Node | undefined;
  startStudyMode: () => void;
  trash: ReturnType<typeof useTrashView>;
  virtualView: ReturnType<typeof useVirtualNodeView>;
  ws: {
    activeNodeId: string | null;
    createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind) => string;
    createHighlightNodeFromSelection: (
      parentNodeId: string,
      content: string,
      anchorId?: string,
      anchorLink?: NodeAnchorLink
    ) => string | null;
    createVirtualNode: () => string;
    createRootNode: (content?: string, kind?: NodeKind) => string;
    documentMaxWidth: number;
    exitReviewSession: () => void;
    gradeReviewCard: (grade: ReviewGrade) => Promise<boolean>;
    completeReviewItem: () => boolean;
    deferReviewItem: () => boolean;
    dismissReviewItem: () => boolean;
    isListCollapsed: boolean;
    isRightSidebarCollapsed: boolean;
    listWidth: number;
    nodeOrder: string[];
    nodesById: Record<string, Node>;
    nodeViewById: Record<string, NodeViewState | undefined>;
    resetLayout: () => void;
    revealReviewAnswer: () => void;
    reviewSession: ReviewSessionState;
    rightSidebarWidth: number;
    setListCollapsed: (collapsed: boolean) => void;
    setListWidth: (width: number) => void;
    setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
    setRightSidebarCollapsed: (collapsed: boolean) => void;
    setRightSidebarWidth: (width: number) => void;
    startReviewSession: (now?: string) => boolean;
    trashedNodeIds: string[];
    updateNodeContent: (nodeId: string, content: string) => void;
    updateVirtualNodeFilter: (nodeId: string, value: string) => void;
    updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
    updateNodePriority: (nodeId: string, priority: number | null) => void;
    updateNodeReveal: (nodeId: string, reveal: string) => void;
    isHydrated: boolean;
  };
  runImportDirectory: () => Promise<boolean>;
  runImportFile: () => Promise<boolean>;
}

export function buildAppControllerLayoutProps(args: BuildControllerLayoutPropsArgs) {
  return buildLayoutProps({
    ...createLayoutDataArgs(args),
    ...createLayoutHandlerArgs(args)
  });
}

function createLayoutDataArgs(args: BuildControllerLayoutPropsArgs) {
  const editorCtx = createLayoutEditorCtx(args);
  const nav = createLayoutNav(args);
  return {
    activeNodeId: args.ws.activeNodeId,
    isWorkspaceHydrated: args.ws.isHydrated,
    reviewSettings: args.reviewSettings,
    canGoBack: args.nav.canGoBack,
    canGoForward: args.nav.canGoForward,
    canGoParent: args.nav.canGoParent,
    canStartStudyMode: args.canStartStudyMode,
    contextMenu: args.editorCtx.contextMenu,
    documentMaxWidth: args.ws.documentMaxWidth,
    documentNode: args.runtime.isViewingTrashNode ? args.selectedTrashNode : args.activeNode,
    documentResize: args.documentResize,
    editorAdapterRef: args.runtime.editorRef,
    ...resolveEditorBindingArgs(args),
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
    isTrashViewOpen: args.trash.isTrashViewOpen,
    isVirtualViewOpen: args.virtualView.isVirtualViewOpen,
    isViewingTrashNode: args.runtime.isViewingTrashNode,
    listWidth: args.ws.listWidth,
    nowIso: args.nowIso,
    rightSidebarWidth: args.ws.rightSidebarWidth,
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    reviewDueCount: args.reviewDueCount,
    reviewPreview: args.reviewPreview,
    reviewSession: args.ws.reviewSession,
    showAnswerSection: !args.isStudyMode || args.ws.reviewSession.isAnswerRevealed,
    selectedTrashNodeId: args.trash.selectedTrashNodeId,
    trashedNodeIds: args.ws.trashedNodeIds,
    startStudyMode: args.startStudyMode,
    startReviewSession: args.ws.startReviewSession,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.exitStudyMode,
    completeReviewItem: args.ws.completeReviewItem,
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    nav,
    editorCtx
  };
}

function createAnswerChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (answer: string) => {
    if (args.ws.activeNodeId && !args.runtime.isViewingTrashNode) {
      args.ws.updateNodeReveal(args.ws.activeNodeId, answer);
    }
  };
}

function createEditorReadyHandler(args: BuildControllerLayoutPropsArgs) {
  return (adapter: EditorAdapter | null) => {
    args.runtime.editorRef.current = adapter;
  };
}

function createLayoutHandlerArgs(args: BuildControllerLayoutPropsArgs) {
  const openNotesView = createOpenNotesView(args);
  const pastedTextAnchors = createPastedTextAnchorsHandler(args);
  const persistPdfViewState = createPersistPdfViewState(args);
  const revealAnchorInDocument = createRevealAnchorInDocument(args);
  const revealDocumentPosition = createRevealDocumentPosition(args);
  const revealDocumentSelection = createRevealDocumentSelection(args);
  const resolveDocumentPositionAtViewportY = createResolveDocumentPositionAtViewportY(args);

  return {
    onAnswerChange: createAnswerChangeHandler(args),
    onEditorChange: createEditorChangeHandler(args),
    onEnterPriorityQuickSet: () => {
      args.priorityQuickSet.enter();
    },
    onNodeContentChange: createNodeContentChangeHandler(args),
    onEditorReady: createEditorReadyHandler(args),
    onPastedTextAnchors: pastedTextAnchors,
    onRevealAnchorInDocument: revealAnchorInDocument,
    onPersistPdfViewState: persistPdfViewState,
    onRevealDocumentPosition: revealDocumentPosition,
    onRevealDocumentSelection: revealDocumentSelection,
    onResolveDocumentPositionAtViewportY: resolveDocumentPositionAtViewportY,
    ...createReadingPositionHandlers(args),
    onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => args.ws.updateNodeDesiredRetention(nodeId, desiredRetention),
    onNodePriorityChange: (nodeId: string, priority: number | null) => args.ws.updateNodePriority(nodeId, priority),
    onOpenNotesView: openNotesView,
    onOpenMoveToNode: () => args.runtime.setIsMoveToNodePaletteOpen(true),
    onOpenSettings: createOpenSettingsHandler(args.runtime),
    onCloseSettings: createCloseSettingsHandler(args.runtime),
    onOpenImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    onCloseImportManagement: () => args.runtime.setIsImportManagementOpen(false),
    onEnterImmersiveEdit: () => undefined,
    onEnterImmersiveMode: () => args.runtime.setIsImmersiveMode(true),
    onExitImmersiveMode: () => args.runtime.setIsImmersiveMode(false),
    onOpenTrashView: createToggleTrashView(args, openNotesView),
    onOpenVirtualView: createToggleVirtualView(args, openNotesView),
    onResetLayout: args.ws.resetLayout,
    onRunImportFile: args.runImportFile,
    onRunImportFolder: args.runImportDirectory,
    onStartClipboardImport: () => undefined,
    onSelectNode: createSelectNode(args),
    onSelectTrashNode: createSelectTrashNodeHandler(args),
    onRightSidebarSplitterKeyDown: args.rightSidebarResize.handleRightSidebarSplitterKeyDown,
    onRightSidebarSplitterPointerDown: args.rightSidebarResize.handleRightSidebarSplitterPointerDown,
    onSplitterKeyDown: args.listResize.handleSplitterKeyDown,
    onSplitterPointerDown: args.listResize.handleSplitterPointerDown,
    onToggleListVisibility: createToggleListVisibility(args),
    onToggleImmersiveMode: () => args.runtime.setIsImmersiveMode((current) => !current),
    onToggleRightSidebarVisibility: createToggleRightSidebarVisibility(args),
    updateGrade: (grade: ReviewGrade) => args.ws.gradeReviewCard(grade),
    completeReviewItem: () => args.ws.completeReviewItem(),
    deferReviewItem: () => args.ws.deferReviewItem(),
    dismissReviewItem: () => args.ws.dismissReviewItem(),
    priorityQuickSetShortcutLabel: args.priorityQuickSet.shortcutLabel
  };
}

function createEditorChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (content: string) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (args.ws.activeNodeId) {
      args.ws.updateNodeContent(args.ws.activeNodeId, content);
      return;
    }
    args.ws.createChildNode(INBOX_NODE_ID, content);
  };
}
function createNodeContentChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, content: string) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (isVirtualEditorNode(args, nodeId)) {
      args.ws.updateVirtualNodeFilter(nodeId, content);
      return;
    }
    args.ws.updateNodeContent(nodeId, content);
  };
}
