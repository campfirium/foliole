import { setEditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import { setMarkdownSyntaxVisibility } from '../../features/editor/model/markdownSyntaxSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
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
import type { WorkspaceState } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

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

interface BuildLayoutPropsArgs {
  activeNodeId: string | null;
  appearance: AppearanceLayoutState;
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
  isSettingsOpen: boolean;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  listWidth: number;
  nav: Pick<WorkspaceLayoutProps, 'onGoBack' | 'onGoForward' | 'onGoParent' | 'onSelectBreadcrumbNode' | 'onSelectNode'>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: WorkspaceLayoutProps['onAnswerChange'];
  onEditorChange: WorkspaceLayoutProps['onEditorChange'];
  onEditorReady: WorkspaceLayoutProps['onEditorReady'];
  onHotkeyUpdate: () => HotkeyUpdateResult;
  onOpenNotesView: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onOpenTrashView: () => void;
  onResetLayout: () => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  onSplitterKeyDown: WorkspaceLayoutProps['onSplitterKeyDown'];
  onSplitterPointerDown: WorkspaceLayoutProps['onSplitterPointerDown'];
  onToggleListVisibility: () => void;
  reviewDueCount: number;
  reviewSession: WorkspaceState['reviewSession'];
  selectedTrashNodeId: string | null;
  showAnswerSection: boolean;
  startStudyMode: () => void;
  startReviewSession: WorkspaceState['startReviewSession'];
  exitReviewSession: WorkspaceState['exitReviewSession'];
  exitStudyMode: () => void;
  updateGrade: (grade: ReviewGrade) => void;
  revealReviewAnswer: () => void;
}

export function countDueReviewNodes(
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[],
  now: string
) {
  return nodeOrder.filter((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return false;
    }
    const node = nodesById[nodeId];
    if (!node || node.reveal === null) {
      return false;
    }
    const due = node.review?.due ?? now;
    return due <= now;
  }).length;
}

export function buildLayoutProps(args: BuildLayoutPropsArgs): WorkspaceLayoutProps {
  const sessionActions = {
    onStartStudyMode: () => args.startReviewSession() && args.startStudyMode(),
    onToggleReviewSession: () => {
      if (args.isStudyMode) {
        args.exitReviewSession();
        args.exitStudyMode();
        return;
      }
      if (args.startReviewSession()) args.startStudyMode();
    }
  };
  const appearanceActions = {
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

  return {
    activeNodeId: args.activeNodeId, canGoBack: args.canGoBack, canGoForward: args.canGoForward, canGoParent: args.canGoParent, contextMenu: args.contextMenu,
    documentMaxWidth: args.documentMaxWidth, editorContent: args.documentNode?.content ?? '', editorNodeId: args.editorNodeId, editorNodeViewState: args.editorNodeViewState,
    canStartStudyMode: args.canStartStudyMode, reviewDueCount: args.reviewDueCount, isStudyMode: args.isStudyMode, isSettingsOpen: args.isSettingsOpen,
    isAnswerRevealed: args.reviewSession.isAnswerRevealed, reviewCurrentNodeId: args.reviewSession.currentNodeId, isDocumentResizing: args.documentResize.isResizingDocument, isResizingList: args.isResizingList, isTrashViewOpen: args.isTrashViewOpen, isViewingTrashNode: args.isViewingTrashNode,
    showAnswerSection: args.showAnswerSection, listWidth: args.listWidth, nodeOrder: args.nodeOrder, nodesById: args.nodesById, onAnswerChange: args.onAnswerChange, onEditorChange: args.onEditorChange,
    onEditorReady: args.onEditorReady, onEditorContextMenu: args.editorCtx.onEditorContextMenu, onResetLayout: args.onResetLayout, onSelectBreadcrumbNode: args.nav.onSelectBreadcrumbNode, onSelectNode: args.nav.onSelectNode,
    onSelectTrashNode: args.onSelectTrashNode, onSplitterKeyDown: args.onSplitterKeyDown, onSplitterPointerDown: args.onSplitterPointerDown, onOpenNotesView: args.onOpenNotesView, onOpenTrashView: args.onOpenTrashView, onToggleListVisibility: args.onToggleListVisibility,
    onGoBack: args.nav.onGoBack, onGoForward: args.nav.onGoForward, onGoParent: args.nav.onGoParent, onCloseContextMenu: args.editorCtx.onCloseContextMenu, onCreateHighlight: args.editorCtx.onCreateHighlight, onCreateCloze: args.editorCtx.onCreateCloze,
    onStartDocumentResize: args.documentResize.startResize, onOpenSettings: args.onOpenSettings, onCloseSettings: args.onCloseSettings, ...sessionActions, ...appearanceActions,
    onRevealAnswer: args.revealReviewAnswer, onGradeReview: (grade) => args.updateGrade(grade), onExitReviewMode: sessionActions.onToggleReviewSession, customUiFont: args.appearance.customUiFont,
    customInterfaceFont: args.appearance.customInterfaceFont, customMonospaceFont: args.appearance.customMonospaceFont, baseColorMode: args.appearance.baseColorMode,
    accentColorPreset: args.appearance.accentColorPreset, uiFontPreset: args.appearance.uiFontPreset, interfaceFontPreset: args.appearance.interfaceFontPreset,
    interfaceFontSize: args.appearance.interfaceFontSize, markdownSyntaxVisibility: args.appearance.markdownSyntaxVisibility, editorDisplayMode: args.appearance.editorDisplayMode,
    monospaceFontPreset: args.appearance.monospaceFontPreset, hotkeyItems: args.hotkeyItems, selectedTrashNodeId: args.selectedTrashNodeId, onHotkeyUpdate: args.onHotkeyUpdate, onHotkeyReset: () => undefined, onHotkeyResetAll: () => undefined
  };
}
