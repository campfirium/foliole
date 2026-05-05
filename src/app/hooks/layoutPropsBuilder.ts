import { setEditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import { setMarkdownSyntaxVisibility } from '../../features/editor/model/markdownSyntaxSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { UnifiedPushQueueRules } from '../../features/review/model/unifiedPushQueueRules';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  INTERFACE_FONT_SIZE_DEFAULT,
  setAccentColorPreset,
  setBaseColorMode,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setUiFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { buildReviewQueuePlan } from '../../store/reviewQueuePlanner';
import type { WorkspaceState } from '../../store/workspaceStore';
import { buildReviewQueueVisibility } from '../components/reviewQueueVisibility';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { createReviewActions } from './reviewSettingsLayoutActions';

interface AppearanceLayoutState {
  accentColorPreset: WorkspaceLayoutProps['accentColorPreset'];
  baseColorMode: WorkspaceLayoutProps['baseColorMode'];
  customInterfaceFont: string;
  customMonospaceFont: string;
  customUiFont: string;
  editorDisplayMode: WorkspaceLayoutProps['editorDisplayMode'];
  interfaceFontPreset: WorkspaceLayoutProps['interfaceFontPreset'];
  interfaceFontSize: number;
  markdownSyntaxVisibility: WorkspaceLayoutProps['markdownSyntaxVisibility'];
  monospaceFontPreset: WorkspaceLayoutProps['monospaceFontPreset'];
  uiFontPreset: WorkspaceLayoutProps['uiFontPreset'];
  setAccentColorPresetState: (value: WorkspaceLayoutProps['accentColorPreset']) => void;
  setBaseColorModeState: (value: WorkspaceLayoutProps['baseColorMode']) => void;
  setCustomInterfaceFontState: (value: string) => void;
  setCustomMonospaceFontState: (value: string) => void;
  setCustomUiFontState: (value: string) => void;
  setEditorDisplayModeState: (value: WorkspaceLayoutProps['editorDisplayMode']) => void;
  setInterfaceFontPresetState: (value: WorkspaceLayoutProps['interfaceFontPreset']) => void;
  setInterfaceFontSizeState: (value: number) => void;
  setMarkdownSyntaxVisibilityState: (value: WorkspaceLayoutProps['markdownSyntaxVisibility']) => void;
  setMonospaceFontPresetState: (value: WorkspaceLayoutProps['monospaceFontPreset']) => void;
  setUiFontPresetState: (value: WorkspaceLayoutProps['uiFontPreset']) => void;
}

interface ReviewSettingsLayoutState {
  reviewSchedulerSettings: ReviewSchedulerSettings;
  setReviewSchedulerSettingsState: (value: ReviewSchedulerSettings) => void;
}

interface BuildLayoutPropsArgs {
  activeNodeId: string | null;
  appearance: AppearanceLayoutState;
  reviewSettings: ReviewSettingsLayoutState;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  canStartStudyMode: boolean;
  contextMenu: WorkspaceLayoutProps['contextMenu'];
  documentMaxWidth: number;
  documentNode?: { content: string };
  documentResize: { isResizingDocument: boolean; startResize: WorkspaceLayoutProps['onStartDocumentResize'] };
  editorCtx: Pick<
    WorkspaceLayoutProps,
    'onCloseContextMenu' | 'onCreateCloze' | 'onCreateHighlight' | 'onEditorContextMenu'
  >;
  editorNodeId: string | null;
  editorNodeViewState: WorkspaceLayoutProps['editorNodeViewState'];
  hotkeyItems: HotkeySettingItem[];
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  isImportManagementOpen: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  isReviewEditing: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  listWidth: number;
  nowIso: string;
  rightSidebarWidth: number;
  nav: Pick<WorkspaceLayoutProps, 'onGoBack' | 'onGoForward' | 'onGoParent' | 'onSelectBreadcrumbNode' | 'onSelectNode'>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onNodeDesiredRetentionChange: WorkspaceLayoutProps['onNodeDesiredRetentionChange'];
  onNodePriorityChange: WorkspaceLayoutProps['onNodePriorityChange'];
  onAnswerChange: WorkspaceLayoutProps['onAnswerChange'];
  onEditorChange: WorkspaceLayoutProps['onEditorChange'];
  onEditorReady: WorkspaceLayoutProps['onEditorReady'];
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onOpenNotesView: () => void;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onCloseImportManagement: () => void;
  onOpenTrashView: () => void;
  onResetLayout: () => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  onRevealAnchorInDocument: WorkspaceLayoutProps['onRevealAnchorInDocument'];
  onRevealDocumentSelection: WorkspaceLayoutProps['onRevealDocumentSelection'];
  onResolveDocumentPositionAtViewportY: WorkspaceLayoutProps['onResolveDocumentPositionAtViewportY'];
  onRightSidebarSplitterKeyDown: WorkspaceLayoutProps['onRightSidebarSplitterKeyDown'];
  onRightSidebarSplitterPointerDown: WorkspaceLayoutProps['onRightSidebarSplitterPointerDown'];
  onSplitterKeyDown: WorkspaceLayoutProps['onSplitterKeyDown'];
  onSplitterPointerDown: WorkspaceLayoutProps['onSplitterPointerDown'];
  onToggleListVisibility: () => void;
  onToggleRightSidebarVisibility: () => void;
  onRunImportFile: WorkspaceLayoutProps['onRunImportFile'];
  onRunImportFolder: WorkspaceLayoutProps['onRunImportFolder'];
  onStartClipboardImport: WorkspaceLayoutProps['onStartClipboardImport'];
  reviewDueCount: number;
  reviewPreview: SchedulerPreviewResult | null;
  reviewSession: WorkspaceState['reviewSession'];
  selectedTrashNodeId: string | null;
  showAnswerSection: boolean;
  startStudyMode: () => void;
  startReviewSession: WorkspaceState['startReviewSession'];
  trashedNodeIds: string[];
  exitReviewSession: WorkspaceState['exitReviewSession'];
  exitStudyMode: () => void;
  updateGrade: (grade: ReviewGrade) => Promise<boolean>;
  completeReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  revealReviewAnswer: () => void;
}

export function countDueReviewNodes(
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[],
  now: string,
  pushQueueRules?: UnifiedPushQueueRules
) {
  return buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now,
    pushQueueRules,
    trashedNodeIds
  }).queueNodeIds.length;
}

function createSessionActions(args: BuildLayoutPropsArgs) {
  return {
    onStartStudyMode: () => (args.startReviewSession(), args.startStudyMode()),
    onToggleReviewSession: () =>
      args.isStudyMode
        ? (args.exitReviewSession(), args.exitStudyMode())
        : (args.startReviewSession(), args.startStudyMode())
  };
}

function createAppearanceActions(args: BuildLayoutPropsArgs) {
  return {
    onBaseColorModeChange: (value: WorkspaceLayoutProps['baseColorMode']) => (setBaseColorMode(value), args.appearance.setBaseColorModeState(value)),
    onAccentColorPresetChange: (value: WorkspaceLayoutProps['accentColorPreset']) => (setAccentColorPreset(value), args.appearance.setAccentColorPresetState(value)),
    onAccentColorPresetReset: () => (setAccentColorPreset(DEFAULT_ACCENT_COLOR_PRESET), args.appearance.setAccentColorPresetState(DEFAULT_ACCENT_COLOR_PRESET)),
    onInterfaceFontPresetChange: (value: WorkspaceLayoutProps['interfaceFontPreset']) => (setInterfaceFontPreset(value), args.appearance.setInterfaceFontPresetState(value)),
    onUiFontPresetChange: (value: WorkspaceLayoutProps['uiFontPreset']) => (setUiFontPreset(value), args.appearance.setUiFontPresetState(value)),
    onCustomUiFontChange: (value: string) => (setCustomUiFont(value), args.appearance.setCustomUiFontState(value)),
    onCustomInterfaceFontChange: (value: string) => (setCustomInterfaceFont(value), args.appearance.setCustomInterfaceFontState(value)),
    onMonospaceFontPresetChange: (value: WorkspaceLayoutProps['monospaceFontPreset']) => (setMonospaceFontPreset(value), args.appearance.setMonospaceFontPresetState(value)),
    onCustomMonospaceFontChange: (value: string) => (setCustomMonospaceFont(value), args.appearance.setCustomMonospaceFontState(value)),
    onInterfaceFontSizeChange: (value: number) => (setInterfaceFontSize(value), args.appearance.setInterfaceFontSizeState(value)),
    onInterfaceFontSizeReset: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), args.appearance.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    onMarkdownSyntaxVisibilityChange: (value: WorkspaceLayoutProps['markdownSyntaxVisibility']) => (setMarkdownSyntaxVisibility(value), args.appearance.setMarkdownSyntaxVisibilityState(value)),
    onToggleEditorDisplayMode: () => {
      const next = args.appearance.editorDisplayMode === 'preview' ? 'source' : 'preview';
      setEditorDisplayMode(next);
      args.appearance.setEditorDisplayModeState(next);
    }
  };
}

function getReviewSessionSummary(reviewSession: WorkspaceState['reviewSession']) {
  const reviewQueueCount = reviewSession.queueNodeIds.length;
  const reviewCompletedCount = Math.max(reviewSession.totalNodeCount - reviewQueueCount, 0);
  const reviewStatus: WorkspaceLayoutProps['reviewStatus'] = reviewSession.currentNodeId
    ? reviewSession.isAnswerRevealed
      ? 'answer-revealed'
      : 'awaiting-answer'
    : 'completed';
  return { reviewCompletedCount, reviewQueueCount, reviewStatus };
}

export function buildLayoutProps(args: BuildLayoutPropsArgs): WorkspaceLayoutProps {
  const sessionActions = createSessionActions(args);
  const appearanceActions = createAppearanceActions(args);
  const reviewActions = createReviewActions(args);
  const currentReviewNode = args.reviewSession.currentNodeId ? args.nodesById[args.reviewSession.currentNodeId] : undefined;
  const isCurrentReviewItemGradable = getReviewItemKind(currentReviewNode) === 'fsrs';
  const { reviewCompletedCount, reviewQueueCount, reviewStatus } = getReviewSessionSummary(
    args.reviewSession
  );
  const reviewQueueVisibility = buildReviewQueueVisibility({
    currentNodeId: args.reviewSession.currentNodeId,
    nodesById: args.nodesById,
    queueNodeIds: args.reviewSession.queueNodeIds,
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings
  });
  const reviewPanelQueueNodeIds = buildReviewQueuePlan({
    includeScheduled: true,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.nowIso,
    pushQueueRules: args.reviewSettings.reviewSchedulerSettings.pushQueue,
    trashedNodeIds: args.trashedNodeIds
  }).queueNodeIds;

  return {
    activeNodeId: args.activeNodeId, canGoBack: args.canGoBack, canGoForward: args.canGoForward, canGoParent: args.canGoParent, contextMenu: args.contextMenu,
    documentMaxWidth: args.documentMaxWidth, editorContent: args.documentNode?.content ?? '', editorNodeId: args.editorNodeId, editorNodeViewState: args.editorNodeViewState,
    onNodePriorityChange: args.onNodePriorityChange, onNodeDesiredRetentionChange: args.onNodeDesiredRetentionChange,
    canStartStudyMode: args.canStartStudyMode, reviewDueCount: args.reviewDueCount, reviewPreview: args.reviewPreview, isStudyMode: args.isStudyMode, isImportManagementOpen: args.isImportManagementOpen, isSettingsOpen: args.isSettingsOpen, isReviewEditing: args.isReviewEditing,
    isAnswerRevealed: args.reviewSession.isAnswerRevealed, isCurrentReviewItemGradable, reviewCurrentNodeId: args.reviewSession.currentNodeId, reviewPanelQueueNodeIds, reviewQueueNodeIds: args.reviewSession.queueNodeIds, reviewQueueVisibility, reviewQueueCount, reviewCompletedCount, reviewStatus, isDocumentResizing: args.documentResize.isResizingDocument, isResizingList: args.isResizingList, isResizingRightSidebar: args.isResizingRightSidebar, isTrashViewOpen: args.isTrashViewOpen, isViewingTrashNode: args.isViewingTrashNode,
    isListCollapsed: args.isListCollapsed, isRightSidebarCollapsed: args.isRightSidebarCollapsed, showAnswerSection: args.showAnswerSection, listWidth: args.listWidth, rightSidebarWidth: args.rightSidebarWidth, nodeOrder: args.nodeOrder, nodesById: args.nodesById, onAnswerChange: args.onAnswerChange, onEditorChange: args.onEditorChange,
    onEditorReady: args.onEditorReady, onEditorContextMenu: args.editorCtx.onEditorContextMenu, onResetLayout: args.onResetLayout, onSelectBreadcrumbNode: args.nav.onSelectBreadcrumbNode, onSelectNode: args.nav.onSelectNode,
    onRevealAnchorInDocument: args.onRevealAnchorInDocument,
    onRevealDocumentSelection: args.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: args.onResolveDocumentPositionAtViewportY,
    onSelectTrashNode: args.onSelectTrashNode, onRightSidebarSplitterKeyDown: args.onRightSidebarSplitterKeyDown, onRightSidebarSplitterPointerDown: args.onRightSidebarSplitterPointerDown, onSplitterKeyDown: args.onSplitterKeyDown, onSplitterPointerDown: args.onSplitterPointerDown, onOpenNotesView: args.onOpenNotesView, onOpenTrashView: args.onOpenTrashView, onToggleListVisibility: args.onToggleListVisibility,
    onToggleRightSidebarVisibility: args.onToggleRightSidebarVisibility,
    onOpenImportManagement: args.onOpenImportManagement,
    onCloseImportManagement: args.onCloseImportManagement,
    onRunImportFile: args.onRunImportFile,
    onRunImportFolder: args.onRunImportFolder,
    onStartClipboardImport: args.onStartClipboardImport,
    onGoBack: args.nav.onGoBack, onGoForward: args.nav.onGoForward, onGoParent: args.nav.onGoParent, onCloseContextMenu: args.editorCtx.onCloseContextMenu, onCreateHighlight: args.editorCtx.onCreateHighlight, onCreateCloze: args.editorCtx.onCreateCloze,
    onStartDocumentResize: args.documentResize.startResize, onOpenSettings: args.onOpenSettings, onCloseSettings: args.onCloseSettings, ...sessionActions, ...appearanceActions, ...reviewActions,
    onRevealAnswer: args.revealReviewAnswer, onGradeReview: (grade) => args.updateGrade(grade), onCompleteReviewItem: () => args.completeReviewItem(), onDeferReviewItem: () => args.deferReviewItem(), onDismissReviewItem: () => args.dismissReviewItem(), onExitReviewMode: sessionActions.onToggleReviewSession, customUiFont: args.appearance.customUiFont,
    customInterfaceFont: args.appearance.customInterfaceFont, customMonospaceFont: args.appearance.customMonospaceFont, baseColorMode: args.appearance.baseColorMode,
    accentColorPreset: args.appearance.accentColorPreset, uiFontPreset: args.appearance.uiFontPreset, interfaceFontPreset: args.appearance.interfaceFontPreset,
    interfaceFontSize: args.appearance.interfaceFontSize, reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings, markdownSyntaxVisibility: args.appearance.markdownSyntaxVisibility, editorDisplayMode: args.appearance.editorDisplayMode,
    monospaceFontPreset: args.appearance.monospaceFontPreset, hotkeyItems: args.hotkeyItems, selectedTrashNodeId: args.selectedTrashNodeId, onHotkeyUpdate: args.onHotkeyUpdate, onHotkeyReset: () => undefined, onHotkeyResetAll: () => undefined
  };
}
