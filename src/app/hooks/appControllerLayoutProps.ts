import type { NodeKind } from '../../../lib/core/nodes/nodeKind';
import type { Node, NodeAnchorLink, NodeImageRegionGroup } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettingsContextValue } from '../../features/settings/context/reviewSchedulerSettingsContext';
import type { NodeViewState, ReviewSessionState } from '../../store/workspaceStore';

import { createAnswerChangeHandler, createEditorChangeHandler, createEditorReadyHandler, createNodeContentChangeHandler, type SelectNodeHandler } from './appControllerEditorHandlers';
import type { useCurrentReviewPreview } from './appControllerHelpers';
import { createLayoutDataArgs } from './appControllerLayoutData';
import { createSelectTrashNodeHandler } from './appControllerNavHandlers';
import { createPastedTextAnchorsHandler } from './appControllerPastedTextAnchors';
import { createReadingPositionHandlers } from './appControllerReadingPosition';
import { createPersistPdfViewState, createRevealAnchorInDocument, createRevealDocumentPosition, createRevealDocumentSelection, createResolveDocumentPositionAtViewportY, createToggleListVisibility, createToggleRightSidebarVisibility } from './appControllerRuntimeActions';
import {
  createOpenExternalSelection,
  createOpenNotesView,
  createSelectNode,
  createToggleTrashView,
  createToggleVirtualView
} from './appControllerTrashViewHandlers';
import { buildLayoutProps } from './layoutPropsBuilder';
import {
  createCloseSettingsHandler,
  createOpenSettingsHandler,
  openExternalLibrarySettings
} from './settingsOverlayRequest';
import type { useAppRuntime } from './useAppRuntime';
import type { useEditorContextCommands } from './useEditorContextCommands';
import type { useExternalLibraryView } from './useExternalLibraryView';
import type { useListResizer } from './useListResizer';
import type { useRightSidebarResizer } from './useRightSidebarResizer';
import type { useTrashView } from './useTrashView';
import type { useVirtualNodeView } from './useVirtualNodeView';
import type { useWorkspaceNavigation } from './useWorkspaceNavigation';

export interface BuildControllerLayoutPropsArgs {
  activeNode: Node | undefined;
  canStartStudyMode: boolean;
  editorCtx: ReturnType<typeof useEditorContextCommands>;
  exitStudyMode: () => void;
  isWorkspaceHydrated: boolean;
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
  externalView: ReturnType<typeof useExternalLibraryView>;
  virtualView: ReturnType<typeof useVirtualNodeView>;
  ws: {
    activeNodeId: string | null;
    createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind) => string;
    createHighlightNodeFromSelection: (
      parentNodeId: string,
      content: string,
      anchorId?: string,
      anchorLink?: NodeAnchorLink,
      imageRegions?: NodeImageRegionGroup[] | null
    ) => string | null;
    createVirtualNode: () => string;
    createRootNode: (content?: string, kind?: NodeKind) => string;
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
    updateHighlightAnchorRange?: (highlightNodeId: string, range: { from: number; to: number }) => boolean;
    updateVirtualNodeFilter: (nodeId: string, value: string) => void;
    updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
    updateNodePriority: (nodeId: string, priority: number | null) => void;
    updateNodeReveal: (nodeId: string, reveal: string) => void;
    isHydrated: boolean;
  };
  runImportDirectory: () => Promise<boolean>;
  runClipboardImport: () => Promise<boolean>;
  runImportFile: () => Promise<boolean>;
}

export function buildAppControllerLayoutProps(args: BuildControllerLayoutPropsArgs) {
  const onSelectNode = createSelectNode(args);
  return buildLayoutProps({
    ...createLayoutDataArgs(args, onSelectNode),
    ...createLayoutHandlerArgs(args, onSelectNode)
  });
}

function createLayoutHandlerArgs(
  args: BuildControllerLayoutPropsArgs,
  onSelectNode: SelectNodeHandler
) {
  const documentHandlers = createLayoutDocumentHandlers(args);

  return {
    onAnswerChange: createAnswerChangeHandler(args),
    onEditorChange: createEditorChangeHandler(args),
    onRegisterEditorDraftFlush: args.runtime.registerPendingEditorDraftFlush,
    onEnterPriorityQuickSet: args.priorityQuickSet.enter,
    onNodeContentChange: createNodeContentChangeHandler(args),
    setNodeViewState: args.ws.setNodeViewState,
    onEditorReady: createEditorReadyHandler(args),
    ...documentHandlers,
    ...createReadingPositionHandlers(args),
    onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => args.ws.updateNodeDesiredRetention(nodeId, desiredRetention),
    onNodePriorityChange: (nodeId: string, priority: number | null) => args.ws.updateNodePriority(nodeId, priority),
    onOpenMoveToNode: args.runtime.openMoveToNodePalette,
    onOpenSettings: createOpenSettingsHandler(args.runtime),
    onOpenExternalView: args.externalView.openExternalFolder,
    onOpenExternalSelection: createOpenExternalSelection(args),
    onOpenExternalLibrarySettings: () => openExternalLibrarySettings(args.runtime),
    onCloseSettings: createCloseSettingsHandler(args.runtime),
    onOpenImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    onCloseImportManagement: () => args.runtime.setIsImportManagementOpen(false),
    onEnterImmersiveEdit: () => undefined,
    onEnterImmersiveMode: () => args.runtime.setIsImmersiveMode(true),
    onExitImmersiveMode: () => args.runtime.setIsImmersiveMode(false),
    onOpenTrashView: createToggleTrashView(args),
    onOpenVirtualView: createToggleVirtualView(args),
    onResetLayout: args.ws.resetLayout,
    onRunImportFile: args.runImportFile,
    onRunImportFolder: args.runImportDirectory,
    onStartClipboardImport: args.runClipboardImport,
    onSelectNode,
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

function createLayoutDocumentHandlers(args: BuildControllerLayoutPropsArgs) {
  return {
    onOpenNotesView: createOpenNotesView(args),
    onPastedTextAnchors: createPastedTextAnchorsHandler(args),
    onPersistPdfViewState: createPersistPdfViewState(args),
    onRevealAnchorInDocument: createRevealAnchorInDocument(args),
    onRevealDocumentPosition: createRevealDocumentPosition(args),
    onRevealDocumentSelection: createRevealDocumentSelection(args),
    onResolveDocumentPositionAtViewportY: createResolveDocumentPositionAtViewportY(args)
  };
}
