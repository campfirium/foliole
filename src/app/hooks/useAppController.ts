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
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

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

function buildPaletteItems(): CommandPaletteItem[] {
  return [
    { id: APP_COMMAND_IDS.openNotes, title: 'Open Notes', section: 'Workspace', enabled: true },
    { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace', enabled: true },
    { id: APP_COMMAND_IDS.openSettings, title: 'Open Settings', section: 'Workspace', enabled: true },
    { id: APP_COMMAND_IDS.startStudyMode, title: 'Start Study Mode', section: 'Review', enabled: true }
  ];
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

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors(), appearance = useAppearanceState(), trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined, selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const study = useStudyMode({ activeNodeId: ws.activeNodeId, isViewingTrashNode: false }), runtime = useAppRuntime(ws, study.startStudyMode, ws.listWidth);
  const listResize = useListResizer(ws.listWidth, ws.setListWidth), documentResize = useDocumentWidthResizer(ws.documentMaxWidth, ws.setDocumentMaxWidth);
  const saveActiveNodeView = useCallback(() => { if (runtime.isViewingTrashNode || !ws.activeNodeId || !runtime.editorRef.current) return; ws.setNodeViewState(ws.activeNodeId, { scrollTop: runtime.editorRef.current.getScrollTop(), selection: runtime.editorRef.current.getSelection() }); }, [runtime.editorRef, runtime.isViewingTrashNode, ws]);
  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, openNode: ws.openNode, saveActiveNodeView });
  const editorCtx = useEditorContextCommands({ activeNode, activeNodeId: ws.activeNodeId, createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection, createQANodeFromSelection: ws.createQANodeFromSelection, editorRef: runtime.editorRef, isTrashViewOpen: runtime.isViewingTrashNode, updateNodeContent: ws.updateNodeContent });
  const hotkeyItems: HotkeySettingItem[] = useMemo(() => buildPaletteItems().map((item) => ({ commandId: item.id, title: item.title, section: item.section, shortcutLabel: '', isCustomized: false })), []);
  const onHotkeyUpdate = (): HotkeyUpdateResult => ({ status: 'blocked', message: 'Hotkey customization is temporarily unavailable.' });
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowIso(new Date().toISOString());
    }, 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const reviewDueCount = useMemo(() => countDueReviewNodes(ws.nodeOrder, ws.nodesById, ws.trashedNodeIds, nowIso), [nowIso, ws.nodeOrder, ws.nodesById, ws.trashedNodeIds]);
  const { exitStudyMode, isStudyMode, startStudyMode } = study;
  const layoutProps = buildLayoutProps({ activeNodeId: ws.activeNodeId, appearance, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward, canGoParent: nav.canGoParent, canStartStudyMode: reviewDueCount > 0 && study.canStartStudyMode, contextMenu: editorCtx.contextMenu, documentMaxWidth: ws.documentMaxWidth, documentNode: runtime.isViewingTrashNode ? selectedTrashNode : activeNode, documentResize, editorNodeId: runtime.isViewingTrashNode ? null : ws.activeNodeId, editorNodeViewState: !runtime.isViewingTrashNode && ws.activeNodeId ? ws.nodeViewById[ws.activeNodeId] : undefined, hotkeyItems, isResizingList: listResize.isResizingList, isSettingsOpen: runtime.isSettingsOpen, isStudyMode, isTrashViewOpen: trash.isTrashViewOpen, isViewingTrashNode: runtime.isViewingTrashNode, listWidth: ws.listWidth, nodeOrder: ws.nodeOrder, nodesById: ws.nodesById, onAnswerChange: (answer) => ws.activeNodeId && !runtime.isViewingTrashNode && ws.updateNodeReveal(ws.activeNodeId, answer), onEditorChange: (content) => !runtime.isViewingTrashNode && (ws.activeNodeId ? ws.updateNodeContent(ws.activeNodeId, content) : ws.createRootNode(content)), onEditorReady: (adapter) => { runtime.editorRef.current = adapter; }, onHotkeyUpdate, onOpenNotesView: trash.closeTrashView, onOpenSettings: () => runtime.setIsSettingsOpen(true), onCloseSettings: () => runtime.setIsSettingsOpen(false), onOpenTrashView: () => (trash.isTrashViewOpen ? trash.closeTrashView() : trash.openTrashView()), onResetLayout: ws.resetLayout, onSelectTrashNode: (nodeId) => (runtime.setIsViewingTrashNode(true), trash.openTrashView(), trash.setSelectedTrashNodeId(nodeId)), onSplitterKeyDown: listResize.handleSplitterKeyDown, onSplitterPointerDown: listResize.handleSplitterPointerDown, onToggleListVisibility: () => (ws.listWidth <= 0 ? ws.setListWidth(Math.max(220, runtime.lastExpandedListWidthRef.current || 300)) : (runtime.lastExpandedListWidthRef.current = ws.listWidth, ws.setListWidth(0))), reviewDueCount, reviewSession: ws.reviewSession, showAnswerSection: !isStudyMode || ws.reviewSession.isAnswerRevealed, selectedTrashNodeId: trash.selectedTrashNodeId, startStudyMode, startReviewSession: ws.startReviewSession, exitReviewSession: ws.exitReviewSession, exitStudyMode, updateGrade: (grade) => void ws.gradeReviewCard(grade), revealReviewAnswer: ws.revealReviewAnswer, nav: { onGoBack: nav.handleGoBack, onGoForward: nav.handleGoForward, onGoParent: nav.handleGoParent, onSelectBreadcrumbNode: nav.handleSelectBreadcrumbNode, onSelectNode: nav.handleSelectNode }, editorCtx: { onCloseContextMenu: editorCtx.closeContextMenu, onCreateCloze: editorCtx.handleCreateCloze, onCreateHighlight: editorCtx.handleCreateHighlight, onEditorContextMenu: editorCtx.handleEditorContextMenu } });
  return {
    layoutProps,
    paletteState: {
      isOpen: runtime.isCommandPaletteOpen,
      items: buildPaletteItems(),
      recentCommandIds: runtime.recentCommandIds,
      onClose: () => runtime.setIsCommandPaletteOpen(false),
      onRunCommand: (id) => runtime.runSimpleCommand(id, trash.closeTrashView, trash.openTrashView)
    }
  };
}
