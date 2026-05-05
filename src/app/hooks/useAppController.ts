import { useCallback, useEffect, useMemo, useState } from 'react';

import { getEditorDisplayMode, type EditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import {
  getMarkdownSyntaxVisibility,
  type MarkdownSyntaxVisibility
} from '../../features/editor/model/markdownSyntaxSetting';
import {
  applyAppearanceSettings,
  getAccentColorPreset,
  getBaseColorMode,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getMonospaceFontPreset,
  getUiFontPreset,
  type AccentColorPreset,
  type BaseColorMode,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildAppPaletteItems, runAppCommand, runReviewModeToggle } from './appCommands';
import { buildLayoutProps, countDueReviewNodes } from './layoutPropsBuilder';
import { useAppRuntime } from './useAppRuntime';
import { useDocumentWidthResizer } from './useDocumentWidthResizer';
import { useEditorContextCommands } from './useEditorContextCommands';
import { useListResizer } from './useListResizer';
import { useStudyMode } from './useStudyMode';
import { useTrashView } from './useTrashView';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';

interface AppPaletteState {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export interface AppControllerResult {
  layoutProps: WorkspaceLayoutProps;
  paletteState: AppPaletteState;
}

const BLOCKED_HOTKEY_UPDATE = (): HotkeyUpdateResult => ({
  status: 'blocked',
  message: 'Hotkey customization is temporarily unavailable.'
});

function mapPaletteItemsToHotkeyItems(items: CommandPaletteItem[]): HotkeySettingItem[] {
  return items.map((item) => ({
    commandId: item.id,
    title: item.title,
    section: item.section,
    shortcutLabel: '',
    isCustomized: false
  }));
}

function useWorkspaceSelectors() {
  return {
    activeNodeId: useWorkspaceStore((state) => state.activeNodeId),
    createHighlightNodeFromSelection: useWorkspaceStore((state) => state.createHighlightNodeFromSelection),
    createQANodeFromSelection: useWorkspaceStore((state) => state.createQANodeFromSelection),
    createRootNode: useWorkspaceStore((state) => state.createRootNode),
    documentMaxWidth: useWorkspaceStore((state) => state.layout.documentMaxWidth),
    goBack: useWorkspaceStore((state) => state.goBack),
    goForward: useWorkspaceStore((state) => state.goForward),
    goToParent: useWorkspaceStore((state) => state.goToParent),
    gradeReviewCard: useWorkspaceStore((state) => state.gradeReviewCard),
    jumpToAncestorNode: useWorkspaceStore((state) => state.jumpToAncestorNode),
    listWidth: useWorkspaceStore((state) => state.layout.listWidth),
    navigation: useWorkspaceStore((state) => state.navigation),
    nodesById: useWorkspaceStore((state) => state.nodesById),
    nodeOrder: useWorkspaceStore((state) => state.nodeOrder),
    nodeViewById: useWorkspaceStore((state) => state.nodeViewById),
    openNode: useWorkspaceStore((state) => state.openNode),
    revealReviewAnswer: useWorkspaceStore((state) => state.revealReviewAnswer),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    resetLayout: useWorkspaceStore((state) => state.resetLayout),
    setDocumentMaxWidth: useWorkspaceStore((state) => state.setDocumentMaxWidth),
    setListWidth: useWorkspaceStore((state) => state.setListWidth),
    setNodeViewState: useWorkspaceStore((state) => state.setNodeViewState),
    startReviewSession: useWorkspaceStore((state) => state.startReviewSession),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds),
    updateNodeContent: useWorkspaceStore((state) => state.updateNodeContent),
    updateNodeReveal: useWorkspaceStore((state) => state.updateNodeReveal),
    exitReviewSession: useWorkspaceStore((state) => state.exitReviewSession)
  };
}

function useAppearanceState() {
  const [markdownSyntaxVisibility, setMarkdownSyntaxVisibilityState] = useState<MarkdownSyntaxVisibility>(() => getMarkdownSyntaxVisibility());
  const [editorDisplayMode, setEditorDisplayModeState] = useState<EditorDisplayMode>(() => getEditorDisplayMode());
  const [baseColorMode, setBaseColorModeState] = useState<BaseColorMode>(() => getBaseColorMode());
  const [accentColorPreset, setAccentColorPresetState] = useState<AccentColorPreset>(() => getAccentColorPreset());
  const [uiFontPreset, setUiFontPresetState] = useState<InterfaceFontPreset>(() => getUiFontPreset());
  const [customUiFont, setCustomUiFontState] = useState(() => getCustomUiFont());
  const [interfaceFontPreset, setInterfaceFontPresetState] = useState<InterfaceFontPreset>(() => getInterfaceFontPreset());
  const [customInterfaceFont, setCustomInterfaceFontState] = useState(() => getCustomInterfaceFont());
  const [monospaceFontPreset, setMonospaceFontPresetState] = useState<MonospaceFontPreset>(() => getMonospaceFontPreset());
  const [customMonospaceFont, setCustomMonospaceFontState] = useState(() => getCustomMonospaceFont());
  const [interfaceFontSize, setInterfaceFontSizeState] = useState(() => getInterfaceFontSize());

  useEffect(() => {
    applyAppearanceSettings({ baseColor: baseColorMode, accentColor: accentColorPreset, uiFont: uiFontPreset, customUiFont, interfaceFont: interfaceFontPreset, interfaceFontSize, monospaceFont: monospaceFontPreset, customInterfaceFont, customMonospaceFont });
  }, [accentColorPreset, baseColorMode, customInterfaceFont, customMonospaceFont, customUiFont, interfaceFontPreset, interfaceFontSize, monospaceFontPreset, uiFontPreset]);

  return {
    accentColorPreset, baseColorMode, customInterfaceFont, customMonospaceFont, customUiFont, editorDisplayMode,
    interfaceFontPreset, interfaceFontSize, markdownSyntaxVisibility, monospaceFontPreset, uiFontPreset,
    setAccentColorPresetState, setBaseColorModeState, setCustomInterfaceFontState, setCustomMonospaceFontState,
    setCustomUiFontState, setEditorDisplayModeState, setInterfaceFontPresetState, setInterfaceFontSizeState,
    setMarkdownSyntaxVisibilityState, setMonospaceFontPresetState, setUiFontPresetState
  };
}

function useNowIso(tickMs = 15_000) {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return nowIso;
}

interface PaletteCommandRunnerArgs {
  isReviewMode: boolean;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => void;
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  onToggleEditorDisplayMode: () => void;
  onToggleListVisibility: () => void;
  openTrashView: () => void;
  paletteItems: CommandPaletteItem[];
  recordRecentCommand: (id: string) => void;
  revealReviewAnswer: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  startReviewSession: () => boolean;
  startStudyMode: () => void;
  trashViewOpen: boolean;
  closeTrashView: () => void;
  goBack: () => void;
  goForward: () => void;
  goParent: () => void;
}

function createPaletteCommandRunner(args: PaletteCommandRunnerArgs) {
  const toggleReviewMode = () =>
    runReviewModeToggle(args.isReviewMode, {
      enterReviewMode: () => args.startReviewSession() && args.startStudyMode(),
      exitReviewMode: () => {
        args.exitReviewSession();
        args.exitStudyMode();
      }
    });

  return (id: string) => {
    const canRun = args.paletteItems.some((item) => item.id === id && item.enabled);
    if (!canRun) {
      return;
    }
    const handled = runAppCommand(id, {
      closeSettings: () => args.setSettingsOpen(false),
      goBack: args.goBack,
      goForward: args.goForward,
      goParent: args.goParent,
      openNotes: args.closeTrashView,
      openSettings: () => args.setSettingsOpen(true),
      openTrash: () => (args.trashViewOpen ? args.closeTrashView() : args.openTrashView()),
      revealReviewAnswer: args.revealReviewAnswer,
      toggleReviewMode,
      toggleEditorDisplayMode: args.onToggleEditorDisplayMode,
      toggleList: args.onToggleListVisibility,
      gradeReviewAgain: () => args.gradeReviewCard(1),
      gradeReviewHard: () => args.gradeReviewCard(2),
      gradeReviewGood: () => args.gradeReviewCard(3),
      gradeReviewEasy: () => args.gradeReviewCard(4)
    });
    if (!handled) {
      return;
    }
    args.recordRecentCommand(id);
    args.setCommandPaletteOpen(false);
  };
}

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors(), appearance = useAppearanceState(), trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  const nowIso = useNowIso();
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined, selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const study = useStudyMode({ activeNodeId: ws.activeNodeId, isViewingTrashNode: false }), runtime = useAppRuntime(ws.listWidth);
  const listResize = useListResizer(ws.listWidth, ws.setListWidth), documentResize = useDocumentWidthResizer(ws.documentMaxWidth, ws.setDocumentMaxWidth);
  const saveActiveNodeView = useCallback(() => { if (runtime.isViewingTrashNode || !ws.activeNodeId || !runtime.editorRef.current) return; ws.setNodeViewState(ws.activeNodeId, { scrollTop: runtime.editorRef.current.getScrollTop(), selection: runtime.editorRef.current.getSelection() }); }, [runtime.editorRef, runtime.isViewingTrashNode, ws]);
  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, openNode: ws.openNode, saveActiveNodeView });
  const editorCtx = useEditorContextCommands({ activeNode, activeNodeId: ws.activeNodeId, createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection, createQANodeFromSelection: ws.createQANodeFromSelection, editorRef: runtime.editorRef, isTrashViewOpen: runtime.isViewingTrashNode, updateNodeContent: ws.updateNodeContent });
  const { exitStudyMode, isStudyMode, startStudyMode } = study;
  const reviewDueCount = useMemo(() => countDueReviewNodes(ws.nodeOrder, ws.nodesById, ws.trashedNodeIds, nowIso), [nowIso, ws.nodeOrder, ws.nodesById, ws.trashedNodeIds]);
  const hasReviewCard = Boolean(ws.reviewSession.currentNodeId);
  const paletteItems = useMemo<CommandPaletteItem[]>(
    () =>
      buildAppPaletteItems({
        canGoBack: nav.canGoBack,
        canGoForward: nav.canGoForward,
        canGoParent: nav.canGoParent,
        canRevealAnswer: hasReviewCard && !ws.reviewSession.isAnswerRevealed,
        canToggleReviewMode: isStudyMode || (reviewDueCount > 0 && study.canStartStudyMode),
        canGradeReview: hasReviewCard && ws.reviewSession.isAnswerRevealed,
        isReviewMode: isStudyMode
      }),
    [hasReviewCard, isStudyMode, nav.canGoBack, nav.canGoForward, nav.canGoParent, reviewDueCount, study.canStartStudyMode, ws.reviewSession.isAnswerRevealed]
  );
  const hotkeyItems: HotkeySettingItem[] = useMemo(() => mapPaletteItemsToHotkeyItems(paletteItems), [paletteItems]);
  const layoutProps = buildLayoutProps({ activeNodeId: ws.activeNodeId, appearance, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward, canGoParent: nav.canGoParent, canStartStudyMode: reviewDueCount > 0 && study.canStartStudyMode, contextMenu: editorCtx.contextMenu, documentMaxWidth: ws.documentMaxWidth, documentNode: runtime.isViewingTrashNode ? selectedTrashNode : activeNode, documentResize, editorNodeId: runtime.isViewingTrashNode ? null : ws.activeNodeId, editorNodeViewState: !runtime.isViewingTrashNode && ws.activeNodeId ? ws.nodeViewById[ws.activeNodeId] : undefined, hotkeyItems, isResizingList: listResize.isResizingList, isSettingsOpen: runtime.isSettingsOpen, isStudyMode, isTrashViewOpen: trash.isTrashViewOpen, isViewingTrashNode: runtime.isViewingTrashNode, listWidth: ws.listWidth, nodeOrder: ws.nodeOrder, nodesById: ws.nodesById, onAnswerChange: (answer) => ws.activeNodeId && !runtime.isViewingTrashNode && ws.updateNodeReveal(ws.activeNodeId, answer), onEditorChange: (content) => !runtime.isViewingTrashNode && (ws.activeNodeId ? ws.updateNodeContent(ws.activeNodeId, content) : ws.createRootNode(content)), onEditorReady: (adapter) => { runtime.editorRef.current = adapter; }, onHotkeyUpdate: BLOCKED_HOTKEY_UPDATE, onOpenNotesView: trash.closeTrashView, onOpenSettings: () => runtime.setIsSettingsOpen(true), onCloseSettings: () => runtime.setIsSettingsOpen(false), onOpenTrashView: () => (trash.isTrashViewOpen ? trash.closeTrashView() : trash.openTrashView()), onResetLayout: ws.resetLayout, onSelectTrashNode: (nodeId) => (runtime.setIsViewingTrashNode(true), trash.openTrashView(), trash.setSelectedTrashNodeId(nodeId)), onSplitterKeyDown: listResize.handleSplitterKeyDown, onSplitterPointerDown: listResize.handleSplitterPointerDown, onToggleListVisibility: () => (ws.listWidth <= 0 ? ws.setListWidth(Math.max(220, runtime.lastExpandedListWidthRef.current || 300)) : (runtime.lastExpandedListWidthRef.current = ws.listWidth, ws.setListWidth(0))), reviewDueCount, reviewSession: ws.reviewSession, showAnswerSection: !isStudyMode || ws.reviewSession.isAnswerRevealed, selectedTrashNodeId: trash.selectedTrashNodeId, startStudyMode, startReviewSession: ws.startReviewSession, exitReviewSession: ws.exitReviewSession, exitStudyMode, updateGrade: (grade) => void ws.gradeReviewCard(grade), revealReviewAnswer: ws.revealReviewAnswer, nav: { onGoBack: nav.handleGoBack, onGoForward: nav.handleGoForward, onGoParent: nav.handleGoParent, onSelectBreadcrumbNode: nav.handleSelectBreadcrumbNode, onSelectNode: nav.handleSelectNode }, editorCtx: { onCloseContextMenu: editorCtx.closeContextMenu, onCreateCloze: editorCtx.handleCreateCloze, onCreateHighlight: editorCtx.handleCreateHighlight, onEditorContextMenu: editorCtx.handleEditorContextMenu } });
  const runPaletteCommand = createPaletteCommandRunner({
    closeTrashView: trash.closeTrashView,
    exitReviewSession: ws.exitReviewSession,
    exitStudyMode,
    goBack: nav.handleGoBack,
    goForward: nav.handleGoForward,
    goParent: nav.handleGoParent,
    gradeReviewCard: ws.gradeReviewCard,
    isReviewMode: isStudyMode,
    onToggleEditorDisplayMode: layoutProps.onToggleEditorDisplayMode,
    onToggleListVisibility: layoutProps.onToggleListVisibility,
    openTrashView: trash.openTrashView,
    paletteItems,
    recordRecentCommand: runtime.recordRecentCommand,
    revealReviewAnswer: ws.revealReviewAnswer,
    setCommandPaletteOpen: runtime.setIsCommandPaletteOpen,
    setSettingsOpen: runtime.setIsSettingsOpen,
    startReviewSession: ws.startReviewSession,
    startStudyMode: study.startStudyMode,
    trashViewOpen: trash.isTrashViewOpen
  });
  return {
    layoutProps,
    paletteState: {
      isOpen: runtime.isCommandPaletteOpen,
      items: paletteItems,
      recentCommandIds: runtime.recentCommandIds,
      onClose: () => runtime.setIsCommandPaletteOpen(false),
      onRunCommand: runPaletteCommand
    }
  };
}
