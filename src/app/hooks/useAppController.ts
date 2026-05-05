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
import { getReviewSchedulerSettingsSignature } from '../../features/settings/model/reviewSchedulerSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { formatShortcutLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildAppPaletteItems } from './appCommands';
import { buildPaletteState, useCurrentReviewPreview } from './appControllerHelpers';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
import { countDueReviewNodes } from './layoutPropsBuilder';
import { useAppRuntime } from './useAppRuntime';
import { useDocumentWidthResizer } from './useDocumentWidthResizer';
import { useEditorContextCommands } from './useEditorContextCommands';
import { useListResizer } from './useListResizer';
import { useReadingProgressSync } from './useReadingProgressSync';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';
import { useReviewSchedulerSettingsState } from './useReviewSchedulerSettingsState';
import { useRightSidebarResizer } from './useRightSidebarResizer';
import { useStudyMode } from './useStudyMode';
import { useTrashView } from './useTrashView';
import { useWorkspaceHydration } from './useWorkspaceHydration';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
export interface AppPaletteState {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export interface AppControllerResult { layoutProps: WorkspaceLayoutProps; paletteState: AppPaletteState; }
const BLOCKED_HOTKEY_UPDATE = (): HotkeyUpdateResult => ({
  status: 'blocked',
  message: 'Hotkey customization is temporarily unavailable.'
});

function mapPaletteItemsToHotkeyItems(items: CommandPaletteItem[]): HotkeySettingItem[] {
  return items.map((item) => ({
    commandId: item.id,
    title: item.title,
    section: item.section,
    shortcutLabel:
      item.id === APP_COMMAND_IDS.gradeReviewGood
        ? '3 / Space'
        : item.shortcut
          ? formatShortcutLabel(item.shortcut)
          : '',
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
    completeReviewItem: useWorkspaceStore((state) => state.completeReviewItem),
    deferReviewItem: useWorkspaceStore((state) => state.deferReviewItem),
    goBack: useWorkspaceStore((state) => state.goBack),
    goForward: useWorkspaceStore((state) => state.goForward),
    goToParent: useWorkspaceStore((state) => state.goToParent),
    gradeReviewCard: useWorkspaceStore((state) => state.gradeReviewCard),
    jumpToAncestorNode: useWorkspaceStore((state) => state.jumpToAncestorNode),
    isListCollapsed: useWorkspaceStore((state) => state.layout.isListCollapsed),
    isRightSidebarCollapsed: useWorkspaceStore((state) => state.layout.isRightSidebarCollapsed),
    listWidth: useWorkspaceStore((state) => state.layout.listWidth),
    navigation: useWorkspaceStore((state) => state.navigation),
    nodesById: useWorkspaceStore((state) => state.nodesById),
    nodeOrder: useWorkspaceStore((state) => state.nodeOrder),
    nodeViewById: useWorkspaceStore((state) => state.nodeViewById),
    openNode: useWorkspaceStore((state) => state.openNode),
    revealReviewAnswer: useWorkspaceStore((state) => state.revealReviewAnswer),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    resetLayout: useWorkspaceStore((state) => state.resetLayout),
    setListCollapsed: useWorkspaceStore((state) => state.setListCollapsed),
    setDocumentMaxWidth: useWorkspaceStore((state) => state.setDocumentMaxWidth),
    setListWidth: useWorkspaceStore((state) => state.setListWidth),
    setRightSidebarCollapsed: useWorkspaceStore((state) => state.setRightSidebarCollapsed),
    setRightSidebarWidth: useWorkspaceStore((state) => state.setRightSidebarWidth),
    setNodeViewState: useWorkspaceStore((state) => state.setNodeViewState),
    startReviewSession: useWorkspaceStore((state) => state.startReviewSession),
    rightSidebarWidth: useWorkspaceStore((state) => state.layout.rightSidebarWidth),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds),
    updateNodeContent: useWorkspaceStore((state) => state.updateNodeContent),
    updateNodeDesiredRetention: useWorkspaceStore((state) => state.updateNodeDesiredRetention),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
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

function useWorkspaceControllerState(
  ws: ReturnType<typeof useWorkspaceSelectors>,
  isWorkspaceHydrated: boolean
) {
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const study = useStudyMode({ activeNodeId: ws.activeNodeId, isViewingTrashNode: false });
  const runtime = useAppRuntime(ws.listWidth, ws.rightSidebarWidth);
  const listResize = useListResizer(ws.listWidth, ws.setListWidth);
  const documentResize = useDocumentWidthResizer(ws.documentMaxWidth, ws.setDocumentMaxWidth);
  const rightSidebarResize = useRightSidebarResizer(ws.rightSidebarWidth, ws.setRightSidebarWidth);
  const saveActiveNodeView = useCallback(() => { if (runtime.isViewingTrashNode || !ws.activeNodeId || !runtime.editorRef.current) return; ws.setNodeViewState(ws.activeNodeId, { scrollTop: runtime.editorRef.current.getScrollTop(), selection: runtime.editorRef.current.getSelection() }); }, [runtime.editorRef, runtime.isViewingTrashNode, ws]);
  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, openNode: ws.openNode, saveActiveNodeView });
  const editorCtx = useEditorContextCommands({ activeNode, activeNodeId: ws.activeNodeId, createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection, createQANodeFromSelection: ws.createQANodeFromSelection, editorRef: runtime.editorRef, isTrashViewOpen: runtime.isViewingTrashNode, updateNodeContent: ws.updateNodeContent });
  useReadingProgressSync({ activeNodeId: ws.activeNodeId, editorRef: runtime.editorRef, isViewingTrashNode: runtime.isViewingTrashNode, isWorkspaceHydrated, nodeViewById: ws.nodeViewById, setNodeViewState: ws.setNodeViewState });
  return { activeNode, documentResize, editorCtx, listResize, nav, rightSidebarResize, runtime, selectedTrashNode, study, trash };
}

function buildControllerPaletteState(args: {
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceNavigation>;
  paletteItems: CommandPaletteItem[];
  runtime: ReturnType<typeof useAppRuntime>;
  study: ReturnType<typeof useStudyMode>;
  trash: ReturnType<typeof useTrashView>;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runPaletteCommand = createPaletteCommandRunner({
    closeTrashView: args.trash.closeTrashView,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.study.exitStudyMode,
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goParent: args.nav.handleGoParent,
    gradeReviewCard: args.ws.gradeReviewCard,
    isReviewMode: args.isStudyMode,
    onToggleEditorDisplayMode: args.layoutProps.onToggleEditorDisplayMode,
    onToggleListVisibility: args.layoutProps.onToggleListVisibility,
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startReviewSession: args.ws.startReviewSession,
    startStudyMode: args.study.startStudyMode,
    trashViewOpen: args.trash.isTrashViewOpen
  });

  return buildPaletteState(
    args.runtime.isCommandPaletteOpen,
    args.paletteItems,
    args.runtime.recentCommandIds,
    () => args.runtime.setIsCommandPaletteOpen(false),
    runPaletteCommand
  );
}

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors(), appearance = useAppearanceState(), reviewSettings = useReviewSchedulerSettingsState(), nowIso = useNowIso();
  const isWorkspaceHydrated = useWorkspaceHydration();
  const { activeNode, documentResize, editorCtx, listResize, nav, rightSidebarResize, runtime, selectedTrashNode, study, trash } = useWorkspaceControllerState(ws, isWorkspaceHydrated);
  const { exitStudyMode, isStudyMode, startStudyMode } = study;
  const reviewPreview = useCurrentReviewPreview(
    isStudyMode,
    ws,
    getReviewSchedulerSettingsSignature(reviewSettings.reviewSchedulerSettings)
  );
  const isCurrentReviewItemGradable = Boolean(
    ws.reviewSession.currentNodeId && ws.nodesById[ws.reviewSession.currentNodeId]?.reveal?.trim().length
  );
  const isReviewEditing = useReviewKeyboardShortcuts({ isStudyMode, isCommandPaletteOpen: runtime.isCommandPaletteOpen, isSettingsOpen: runtime.isSettingsOpen, reviewCurrentNodeId: ws.reviewSession.currentNodeId, isAnswerRevealed: ws.reviewSession.isAnswerRevealed, isCurrentItemGradable: isCurrentReviewItemGradable, completeReviewItem: ws.completeReviewItem, revealReviewAnswer: ws.revealReviewAnswer, gradeReviewCard: ws.gradeReviewCard });
  const reviewDueCount = useMemo(() => countDueReviewNodes(ws.nodeOrder, ws.nodesById, ws.trashedNodeIds, nowIso, reviewSettings.reviewSchedulerSettings.pushQueue), [nowIso, reviewSettings.reviewSchedulerSettings.pushQueue, ws.nodeOrder, ws.nodesById, ws.trashedNodeIds]);
  const hasReviewCard = Boolean(ws.reviewSession.currentNodeId);
  const paletteItems = useMemo<CommandPaletteItem[]>(
    () =>
      buildAppPaletteItems({
        canGoBack: nav.canGoBack,
        canGoForward: nav.canGoForward,
        canGoParent: nav.canGoParent,
        canRevealAnswer: hasReviewCard && isCurrentReviewItemGradable && !ws.reviewSession.isAnswerRevealed,
        canToggleReviewMode: isStudyMode || study.canStartStudyMode,
        canGradeReview: hasReviewCard && isCurrentReviewItemGradable && ws.reviewSession.isAnswerRevealed,
        isReviewMode: isStudyMode
      }),
    [hasReviewCard, isCurrentReviewItemGradable, isStudyMode, nav.canGoBack, nav.canGoForward, nav.canGoParent, study.canStartStudyMode, ws.reviewSession.isAnswerRevealed]
  );
  const layoutProps = buildAppControllerLayoutProps({
    activeNode,
    appearance,
    blockedHotkeyUpdate: BLOCKED_HOTKEY_UPDATE,
    canStartStudyMode: study.canStartStudyMode,
    documentResize,
    editorCtx,
    exitStudyMode,
    hotkeyItems: paletteItems,
    isReviewEditing,
    isStudyMode,
    listResize,
    mapPaletteItemsToHotkeyItems,
    nav,
    reviewDueCount,
    reviewPreview,
    reviewSettings,
    rightSidebarResize,
    runtime,
    selectedTrashNode,
    startStudyMode,
    trash,
    ws
  });
  return {
    layoutProps,
    paletteState: buildControllerPaletteState({ isStudyMode, layoutProps, nav, paletteItems, runtime, study, trash, ws })
  };
}
