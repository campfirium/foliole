import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import {
  getEditorDisplayMode,
  setEditorDisplayMode,
  type EditorDisplayMode
} from '../../features/editor/model/editorDisplayMode';
import {
  getMarkdownSyntaxVisibility,
  setMarkdownSyntaxVisibility,
  type MarkdownSyntaxVisibility
} from '../../features/editor/model/markdownSyntaxSetting';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import {
  INTERFACE_FONT_SIZE_DEFAULT,
  DEFAULT_ACCENT_COLOR_PRESET,
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
  setAccentColorPreset,
  setBaseColorMode,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setUiFontPreset,
  type AccentColorPreset,
  type BaseColorMode,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { onWindowKeydown } from '../../shared/platform/keyboard';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

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

function useAppRuntime(ws: ReturnType<typeof useWorkspaceSelectors>, startStudyMode: () => void) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(ws.listWidth);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);

  useEffect(
    () =>
      onWindowKeydown((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setIsCommandPaletteOpen((open) => !open);
        }
      }),
    []
  );

  const runSimpleCommand = (id: string, closeTrashView: () => void, openTrashView: () => void) => {
    setRecentCommandIds((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 20));
    if (id === APP_COMMAND_IDS.openNotes) closeTrashView();
    if (id === APP_COMMAND_IDS.openTrash) openTrashView();
    if (id === APP_COMMAND_IDS.openSettings) setIsSettingsOpen((open) => !open);
    if (id === APP_COMMAND_IDS.startStudyMode && ws.startReviewSession()) startStudyMode();
    setIsCommandPaletteOpen(false);
  };

  return {
    editorRef,
    isCommandPaletteOpen,
    isSettingsOpen,
    isViewingTrashNode,
    lastExpandedListWidthRef,
    recentCommandIds,
    runSimpleCommand,
    setIsCommandPaletteOpen,
    setIsSettingsOpen,
    setIsViewingTrashNode
  };
}

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors();
  const appearance = useAppearanceState();
  const trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const study = useStudyMode({ activeNodeId: ws.activeNodeId, isViewingTrashNode: false });
  const runtime = useAppRuntime(ws, study.startStudyMode);
  const listResize = useListResizer(ws.listWidth, ws.setListWidth);
  const documentResize = useDocumentWidthResizer(ws.documentMaxWidth, ws.setDocumentMaxWidth);
  const saveActiveNodeView = useCallback(() => {
    if (runtime.isViewingTrashNode || !ws.activeNodeId || !runtime.editorRef.current) return;
    ws.setNodeViewState(ws.activeNodeId, { scrollTop: runtime.editorRef.current.getScrollTop(), selection: runtime.editorRef.current.getSelection() });
  }, [runtime.editorRef, runtime.isViewingTrashNode, ws]);

  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, openNode: ws.openNode, saveActiveNodeView });
  const editorCtx = useEditorContextCommands({ activeNode, activeNodeId: ws.activeNodeId, createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection, createQANodeFromSelection: ws.createQANodeFromSelection, editorRef: runtime.editorRef, isTrashViewOpen: runtime.isViewingTrashNode, updateNodeContent: ws.updateNodeContent });

  const hotkeyItems: HotkeySettingItem[] = useMemo(
    () => buildPaletteItems().map((item) => ({ commandId: item.id, title: item.title, section: item.section, shortcutLabel: '', isCustomized: false })),
    []
  );
  const onHotkeyUpdate = (): HotkeyUpdateResult => ({ status: 'blocked', message: 'Hotkey customization is temporarily unavailable.' });

  const layoutProps = buildLayoutProps({ appearance, documentNode: runtime.isViewingTrashNode ? selectedTrashNode : activeNode, documentResize, editorCtx, hotkeyItems, listResize, nav, onHotkeyUpdate, runtime, study, trash, ws });
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

function buildLayoutProps(args: {
  appearance: ReturnType<typeof useAppearanceState>;
  documentNode: typeof useWorkspaceStore extends never ? never : { content: string } | undefined;
  documentResize: ReturnType<typeof useDocumentWidthResizer>;
  editorCtx: ReturnType<typeof useEditorContextCommands>;
  hotkeyItems: HotkeySettingItem[];
  listResize: ReturnType<typeof useListResizer>;
  nav: ReturnType<typeof useWorkspaceNavigation>;
  onHotkeyUpdate: () => HotkeyUpdateResult;
  runtime: ReturnType<typeof useAppRuntime>;
  study: ReturnType<typeof useStudyMode>;
  trash: ReturnType<typeof useTrashView>;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): WorkspaceLayoutProps {
  const { appearance, documentNode, documentResize, editorCtx, hotkeyItems, listResize, nav, onHotkeyUpdate, runtime, study, trash, ws } = args;
  return {
    activeNodeId: ws.activeNodeId, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward, canGoParent: nav.canGoParent, contextMenu: editorCtx.contextMenu,
    documentMaxWidth: ws.documentMaxWidth, editorContent: documentNode?.content ?? '', editorNodeId: runtime.isViewingTrashNode ? null : ws.activeNodeId,
    editorNodeViewState: !runtime.isViewingTrashNode && ws.activeNodeId ? ws.nodeViewById[ws.activeNodeId] : undefined, canStartStudyMode: study.canStartStudyMode,
    isStudyMode: study.isStudyMode, isSettingsOpen: runtime.isSettingsOpen, isAnswerRevealed: ws.reviewSession.isAnswerRevealed, isDocumentResizing: documentResize.isResizingDocument,
    isResizingList: listResize.isResizingList, isTrashViewOpen: trash.isTrashViewOpen, isViewingTrashNode: runtime.isViewingTrashNode, showAnswerSection: !study.isStudyMode || ws.reviewSession.isAnswerRevealed,
    listWidth: ws.listWidth, nodeOrder: ws.nodeOrder, nodesById: ws.nodesById, onAnswerChange: (answer) => ws.activeNodeId && !runtime.isViewingTrashNode && ws.updateNodeReveal(ws.activeNodeId, answer),
    onEditorChange: (content) => !runtime.isViewingTrashNode && (ws.activeNodeId ? ws.updateNodeContent(ws.activeNodeId, content) : ws.createRootNode(content)), onEditorReady: (adapter) => (runtime.editorRef.current = adapter),
    onEditorContextMenu: editorCtx.handleEditorContextMenu, onResetLayout: ws.resetLayout, onSelectBreadcrumbNode: nav.handleSelectBreadcrumbNode, onSelectNode: nav.handleSelectNode,
    onSelectTrashNode: (nodeId) => (runtime.setIsViewingTrashNode(true), trash.openTrashView(), trash.setSelectedTrashNodeId(nodeId)), onSplitterKeyDown: listResize.handleSplitterKeyDown,
    onSplitterPointerDown: listResize.handleSplitterPointerDown, onOpenNotesView: trash.closeTrashView, onOpenTrashView: () => (trash.isTrashViewOpen ? trash.closeTrashView() : trash.openTrashView()),
    onToggleListVisibility: () => (ws.listWidth <= 0 ? ws.setListWidth(Math.max(220, runtime.lastExpandedListWidthRef.current || 300)) : (runtime.lastExpandedListWidthRef.current = ws.listWidth, ws.setListWidth(0))),
    onGoBack: nav.handleGoBack, onGoForward: nav.handleGoForward, onGoParent: nav.handleGoParent, onCloseContextMenu: editorCtx.closeContextMenu, onCreateHighlight: editorCtx.handleCreateHighlight,
    onCreateCloze: editorCtx.handleCreateCloze, onStartDocumentResize: documentResize.startResize, onStartStudyMode: () => ws.startReviewSession() && study.startStudyMode(), onOpenSettings: () => runtime.setIsSettingsOpen(true),
    onCloseSettings: () => runtime.setIsSettingsOpen(false), onBaseColorModeChange: (value) => (setBaseColorMode(value), appearance.setBaseColorModeState(value)), onAccentColorPresetChange: (value) => (setAccentColorPreset(value), appearance.setAccentColorPresetState(value)),
    onAccentColorPresetReset: () => (setAccentColorPreset(DEFAULT_ACCENT_COLOR_PRESET), appearance.setAccentColorPresetState(DEFAULT_ACCENT_COLOR_PRESET)), onInterfaceFontPresetChange: (value) => (setInterfaceFontPreset(value), appearance.setInterfaceFontPresetState(value)),
    onUiFontPresetChange: (value) => (setUiFontPreset(value), appearance.setUiFontPresetState(value)), onCustomUiFontChange: (value) => (setCustomUiFont(value), appearance.setCustomUiFontState(value)), onCustomInterfaceFontChange: (value) => (setCustomInterfaceFont(value), appearance.setCustomInterfaceFontState(value)),
    onMonospaceFontPresetChange: (value) => (setMonospaceFontPreset(value), appearance.setMonospaceFontPresetState(value)), onCustomMonospaceFontChange: (value) => (setCustomMonospaceFont(value), appearance.setCustomMonospaceFontState(value)),
    onInterfaceFontSizeChange: (value) => (setInterfaceFontSize(value), appearance.setInterfaceFontSizeState(value)), onInterfaceFontSizeReset: () => (setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT), appearance.setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT)),
    onMarkdownSyntaxVisibilityChange: (value) => (setMarkdownSyntaxVisibility(value), appearance.setMarkdownSyntaxVisibilityState(value)), onToggleEditorDisplayMode: () => {
      const next: EditorDisplayMode = appearance.editorDisplayMode === 'preview' ? 'source' : 'preview';
      setEditorDisplayMode(next);
      appearance.setEditorDisplayModeState(next);
    },
    onRevealAnswer: ws.revealReviewAnswer, onGradeReview: (grade: ReviewGrade) => void ws.gradeReviewCard(grade), customUiFont: appearance.customUiFont,
    customInterfaceFont: appearance.customInterfaceFont, customMonospaceFont: appearance.customMonospaceFont, baseColorMode: appearance.baseColorMode,
    accentColorPreset: appearance.accentColorPreset, uiFontPreset: appearance.uiFontPreset, interfaceFontPreset: appearance.interfaceFontPreset,
    interfaceFontSize: appearance.interfaceFontSize, markdownSyntaxVisibility: appearance.markdownSyntaxVisibility, editorDisplayMode: appearance.editorDisplayMode,
    monospaceFontPreset: appearance.monospaceFontPreset, hotkeyItems, selectedTrashNodeId: trash.selectedTrashNodeId, onHotkeyUpdate,
    onHotkeyReset: () => undefined, onHotkeyResetAll: () => undefined
  };
}
