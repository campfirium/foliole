import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import type {
  AccentColorPreset,
  BaseColorMode,
  InterfaceFontPreset,
  MonospaceFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { CommandPaletteItem } from '../../shared/commands/types';
import type { MarkdownSyntaxVisibility } from '../../shared/config/appSettings';
import type { NodeViewState, ReviewSessionState } from '../../store/workspaceStore';

import type { useCurrentReviewPreview } from './appControllerHelpers';
import {
  createRevealAnchorInDocument,
  createRevealDocumentSelection,
  createResolveDocumentPositionAtViewportY,
  createToggleListVisibility,
  createToggleRightSidebarVisibility
} from './appControllerRuntimeActions';
import { createOpenNotesView, createSelectNode, createToggleTrashView } from './appControllerTrashViewHandlers';
import { buildLayoutProps } from './layoutPropsBuilder';
import type { useAppRuntime } from './useAppRuntime';
import type { useDocumentWidthResizer } from './useDocumentWidthResizer';
import type { useEditorContextCommands } from './useEditorContextCommands';
import type { useListResizer } from './useListResizer';
import type { useReviewSchedulerSettingsState } from './useReviewSchedulerSettingsState';
import type { useRightSidebarResizer } from './useRightSidebarResizer';
import type { useTrashView } from './useTrashView';
import type { useWorkspaceNavigation } from './useWorkspaceNavigation';

export interface BuildControllerLayoutPropsArgs {
  activeNode: Node | undefined;
  appearance: {
    accentColorPreset: AccentColorPreset;
    baseColorMode: BaseColorMode;
    customInterfaceFont: string;
    customMonospaceFont: string;
    customUiFont: string;
    editorDisplayMode: EditorDisplayMode;
    interfaceFontPreset: InterfaceFontPreset;
    interfaceFontSize: number;
    markdownSyntaxVisibility: MarkdownSyntaxVisibility;
    monospaceFontPreset: MonospaceFontPreset;
    uiFontPreset: InterfaceFontPreset;
    setAccentColorPresetState: (value: AccentColorPreset) => void;
    setBaseColorModeState: (value: BaseColorMode) => void;
    setCustomInterfaceFontState: (value: string) => void;
    setCustomMonospaceFontState: (value: string) => void;
    setCustomUiFontState: (value: string) => void;
    setEditorDisplayModeState: (value: EditorDisplayMode) => void;
    setInterfaceFontPresetState: (value: InterfaceFontPreset) => void;
    setInterfaceFontSizeState: (value: number) => void;
    setMarkdownSyntaxVisibilityState: (value: MarkdownSyntaxVisibility) => void;
    setMonospaceFontPresetState: (value: MonospaceFontPreset) => void;
    setUiFontPresetState: (value: InterfaceFontPreset) => void;
  };
  blockedHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  canStartStudyMode: boolean;
  documentResize: ReturnType<typeof useDocumentWidthResizer>;
  editorCtx: ReturnType<typeof useEditorContextCommands>;
  exitStudyMode: () => void;
  hotkeyItems: CommandPaletteItem[];
  isReviewEditing: boolean;
  isStudyMode: boolean;
  listResize: ReturnType<typeof useListResizer>;
  nav: ReturnType<typeof useWorkspaceNavigation>;
  nowIso: string;
  reviewDueCount: number;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettingsState>;
  rightSidebarResize: ReturnType<typeof useRightSidebarResizer>;
  runtime: ReturnType<typeof useAppRuntime>;
  selectedTrashNode: Node | undefined;
  startStudyMode: () => void;
  trash: ReturnType<typeof useTrashView>;
  ws: {
    activeNodeId: string | null;
    createRootNode: (content?: string) => string;
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
    updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
    updateNodePriority: (nodeId: string, priority: number | null) => void;
    updateNodeReveal: (nodeId: string, reveal: string) => void;
  };
  mapPaletteItemsToHotkeyItems: (items: CommandPaletteItem[]) => HotkeySettingItem[];
  runImportDirectory: () => Promise<boolean>;
  runImportFile: () => Promise<boolean>;
}

function resolveEditorBindingArgs(args: BuildControllerLayoutPropsArgs) {
  const isInboxActiveNode = !args.runtime.isViewingTrashNode && isInboxNode(args.activeNode);
  return {
    editorNodeId: args.runtime.isViewingTrashNode || isInboxActiveNode ? null : args.ws.activeNodeId,
    editorNodeViewState:
      !args.runtime.isViewingTrashNode && !isInboxActiveNode && args.ws.activeNodeId
        ? args.ws.nodeViewById[args.ws.activeNodeId]
        : undefined
  };
}

export function buildAppControllerLayoutProps(args: BuildControllerLayoutPropsArgs) {
  return buildLayoutProps({
    ...createLayoutDataArgs(args),
    ...createLayoutHandlerArgs(args)
  });
}

function createLayoutDataArgs(args: BuildControllerLayoutPropsArgs) {
  return {
    activeNodeId: args.ws.activeNodeId,
    appearance: args.appearance,
    reviewSettings: args.reviewSettings,
    canGoBack: args.nav.canGoBack,
    canGoForward: args.nav.canGoForward,
    canGoParent: args.nav.canGoParent,
    canStartStudyMode: args.canStartStudyMode,
    contextMenu: args.editorCtx.contextMenu,
    documentMaxWidth: args.ws.documentMaxWidth,
    documentNode: args.runtime.isViewingTrashNode ? args.selectedTrashNode : args.activeNode,
    documentResize: args.documentResize,
    ...resolveEditorBindingArgs(args),
    hotkeyItems: args.mapPaletteItemsToHotkeyItems(args.hotkeyItems),
    isResizingList: args.listResize.isResizingList,
    isResizingRightSidebar: args.rightSidebarResize.isResizingRightSidebar,
    isSettingsOpen: args.runtime.isSettingsOpen,
    isStudyMode: args.isStudyMode,
    isReviewEditing: args.isReviewEditing,
    isImportManagementOpen: args.runtime.isImportManagementOpen,
    isListCollapsed: args.ws.isListCollapsed,
    isRightSidebarCollapsed: args.ws.isRightSidebarCollapsed,
    isTrashViewOpen: args.trash.isTrashViewOpen,
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
    nav: {
      onGoBack: args.nav.handleGoBack,
      onGoForward: args.nav.handleGoForward,
      onGoParent: args.nav.handleGoParent,
      onSelectBreadcrumbNode: args.nav.handleSelectBreadcrumbNode,
      onSelectNode: args.nav.handleSelectNode
    },
    editorCtx: {
      onCloseContextMenu: args.editorCtx.closeContextMenu,
      onCreateCloze: args.editorCtx.handleCreateCloze,
      onCreateHighlight: args.editorCtx.handleCreateHighlight,
      onEditorContextMenu: args.editorCtx.handleEditorContextMenu
    }
  };
}

function createLayoutHandlerArgs(args: BuildControllerLayoutPropsArgs) {
  const openNotesView = createOpenNotesView(args);
  const revealAnchorInDocument = createRevealAnchorInDocument(args);
  const revealDocumentSelection = createRevealDocumentSelection(args);
  const resolveDocumentPositionAtViewportY = createResolveDocumentPositionAtViewportY(args);

  return {
    onAnswerChange: (answer: string) => {
      if (args.ws.activeNodeId && !args.runtime.isViewingTrashNode) {
        args.ws.updateNodeReveal(args.ws.activeNodeId, answer);
      }
    },
    onEditorChange: (content: string) => {
      if (args.runtime.isViewingTrashNode) {
        return;
      }
      if (args.ws.activeNodeId) {
        args.ws.updateNodeContent(args.ws.activeNodeId, content);
        return;
      }
      args.ws.createRootNode(content);
    },
    onEditorReady: (adapter: EditorAdapter | null) => {
      args.runtime.editorRef.current = adapter;
    },
    onRevealAnchorInDocument: revealAnchorInDocument,
    onRevealDocumentSelection: revealDocumentSelection,
    onResolveDocumentPositionAtViewportY: resolveDocumentPositionAtViewportY,
    onHotkeyUpdate: args.blockedHotkeyUpdate,
    onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => args.ws.updateNodeDesiredRetention(nodeId, desiredRetention),
    onNodePriorityChange: (nodeId: string, priority: number | null) => args.ws.updateNodePriority(nodeId, priority),
    onOpenNotesView: openNotesView,
    onOpenSettings: () => args.runtime.setIsSettingsOpen(true),
    onCloseSettings: () => args.runtime.setIsSettingsOpen(false),
    onOpenImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    onCloseImportManagement: () => args.runtime.setIsImportManagementOpen(false),
    onOpenTrashView: createToggleTrashView(args, openNotesView),
    onResetLayout: args.ws.resetLayout,
    onRunImportFile: args.runImportFile,
    onRunImportFolder: args.runImportDirectory,
    onStartClipboardImport: () => undefined,
    onSelectNode: createSelectNode(args),
    onSelectTrashNode: (nodeId: string) => {
      args.runtime.setIsViewingTrashNode(true);
      args.trash.openTrashView();
      args.trash.setSelectedTrashNodeId(nodeId);
    },
    onRightSidebarSplitterKeyDown: args.rightSidebarResize.handleRightSidebarSplitterKeyDown,
    onRightSidebarSplitterPointerDown: args.rightSidebarResize.handleRightSidebarSplitterPointerDown,
    onSplitterKeyDown: args.listResize.handleSplitterKeyDown,
    onSplitterPointerDown: args.listResize.handleSplitterPointerDown,
    onToggleListVisibility: createToggleListVisibility(args),
    onToggleRightSidebarVisibility: createToggleRightSidebarVisibility(args),
    updateGrade: (grade: ReviewGrade) => args.ws.gradeReviewCard(grade),
    completeReviewItem: () => args.ws.completeReviewItem(),
    deferReviewItem: () => args.ws.deferReviewItem(),
    dismissReviewItem: () => args.ws.dismissReviewItem()
  };
}
