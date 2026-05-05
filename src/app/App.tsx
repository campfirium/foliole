import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import {
  getEditorDisplayMode,
  setEditorDisplayMode,
  type EditorDisplayMode
} from '../features/editor/model/editorDisplayMode';
import {
  getMarkdownSyntaxVisibility,
  setMarkdownSyntaxVisibility,
  type MarkdownSyntaxVisibility
} from '../features/editor/model/markdownSyntaxSetting';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import {
  INTERFACE_FONT_SIZE_DEFAULT,
  applyAppearanceSettings,
  DEFAULT_ACCENT_COLOR_PRESET,
  getAccentColorPreset,
  getBaseColorMode,
  getCustomUiFont,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getMonospaceFontPreset,
  getUiFontPreset,
  setAccentColorPreset,
  setBaseColorMode,
  setCustomUiFont,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setUiFontPreset,
  type AccentColorPreset,
  type BaseColorMode,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../features/settings/model/hotkeySettings';
import { buildCommandShortcutConflictMap } from '../shared/commands/conflicts';
import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS, type AppCommandId } from '../shared/commands/ids';
import {
  buildShortcutOverrideLabel,
  getCommandShortcutOverrides,
  resolveCommandShortcutMap,
  setCommandShortcutOverrides,
  type CommandShortcutOverrides
} from '../shared/commands/keymap';
import { getRecentCommandIds, pushRecentCommandId, setRecentCommandIds } from '../shared/commands/recentCommands';
import { createCommandRegistry } from '../shared/commands/registry';
import { formatShortcutLabel, parseShortcutLabel } from '../shared/commands/shortcuts';
import type { CommandRegistration } from '../shared/commands/types';
import { onNativeMenuCommand, syncNativeMenuState } from '../shared/platform/commandMenu';
import { onWindowKeydown } from '../shared/platform/keyboard';
import { useWorkspaceStore } from '../store/workspaceStore';

import { CommandPalette } from './components/CommandPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useEditorContextCommands } from './hooks/useEditorContextCommands';
import { useListResizer } from './hooks/useListResizer';
import { useStudyMode } from './hooks/useStudyMode';
import { useTrashView } from './hooks/useTrashView';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';

const APP_COMMAND_ID_SET = new Set<string>(Object.values(APP_COMMAND_IDS));
const DEFAULT_SHORTCUT_SCOPE = 'global';
const COMMAND_SHORTCUT_SCOPE_BY_ID: Record<AppCommandId, string> = {
  [APP_COMMAND_IDS.toggleCommandPaletteMac]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.toggleCommandPaletteWin]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.closeCommandPalette]: 'commandPalette',
  [APP_COMMAND_IDS.closeSettings]: 'settings',
  [APP_COMMAND_IDS.closeContextMenu]: 'contextMenu',
  [APP_COMMAND_IDS.goBack]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.goForward]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.goParent]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.toggleEditorDisplayMode]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.startStudyMode]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.revealReviewAnswer]: 'review',
  [APP_COMMAND_IDS.gradeReviewAgain]: 'review',
  [APP_COMMAND_IDS.gradeReviewHard]: 'review',
  [APP_COMMAND_IDS.gradeReviewGood]: 'review',
  [APP_COMMAND_IDS.gradeReviewEasy]: 'review',
  [APP_COMMAND_IDS.openNotes]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.openTrash]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.openSettings]: DEFAULT_SHORTCUT_SCOPE,
  [APP_COMMAND_IDS.toggleList]: DEFAULT_SHORTCUT_SCOPE
};

function isAppCommandId(value: string): value is AppCommandId {
  return APP_COMMAND_ID_SET.has(value);
}

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const createHighlightNodeFromSelection = useWorkspaceStore((state) => state.createHighlightNodeFromSelection);
  const createQANodeFromSelection = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const documentMaxWidth = useWorkspaceStore((state) => state.layout.documentMaxWidth);
  const goBack = useWorkspaceStore((state) => state.goBack);
  const goForward = useWorkspaceStore((state) => state.goForward);
  const goToParent = useWorkspaceStore((state) => state.goToParent);
  const gradeReviewCard = useWorkspaceStore((state) => state.gradeReviewCard);
  const jumpToAncestorNode = useWorkspaceStore((state) => state.jumpToAncestorNode);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const navigation = useWorkspaceStore((state) => state.navigation);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const openNode = useWorkspaceStore((state) => state.openNode);
  const revealReviewAnswer = useWorkspaceStore((state) => state.revealReviewAnswer);
  const reviewSession = useWorkspaceStore((state) => state.reviewSession);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const setNodeViewState = useWorkspaceStore((state) => state.setNodeViewState);
  const startReviewSession = useWorkspaceStore((state) => state.startReviewSession);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const updateNodeReveal = useWorkspaceStore((state) => state.updateNodeReveal);
  const exitReviewSession = useWorkspaceStore((state) => state.exitReviewSession);

  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(listWidth);

  const listResize = useListResizer(listWidth, setListWidth);
  const documentResize = useDocumentWidthResizer(documentMaxWidth, setDocumentMaxWidth);
  const {
    closeTrashView,
    isTrashViewOpen,
    openTrashView,
    selectedTrashNodeId,
    setSelectedTrashNodeId
  } = useTrashView({
    nodeOrder,
    trashedNodeIds
  });
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [recentCommandIds, setRecentCommandIdsState] = useState<string[]>(() => getRecentCommandIds());
  const [commandShortcutOverrides, setCommandShortcutOverridesState] = useState<CommandShortcutOverrides>(() =>
    getCommandShortcutOverrides()
  );
  const [markdownSyntaxVisibility, setMarkdownSyntaxVisibilityState] = useState<MarkdownSyntaxVisibility>(() =>
    getMarkdownSyntaxVisibility()
  );
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
  const { canStartStudyMode, isStudyMode, resetStudyMode, startStudyMode } = useStudyMode({
    activeNodeId,
    isViewingTrashNode
  });
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const selectedTrashNode = selectedTrashNodeId ? nodesById[selectedTrashNodeId] : undefined;
  const documentNode = isViewingTrashNode ? selectedTrashNode : activeNode;
  const editorContent = documentNode?.content ?? '';
  const editorNodeId = isViewingTrashNode ? null : activeNodeId;
  const activeNodeViewState = !isViewingTrashNode && activeNodeId ? nodeViewById[activeNodeId] : undefined;
  const { closeContextMenu, contextMenu, handleCreateCloze, handleCreateHighlight, handleEditorContextMenu } =
    useEditorContextCommands({
      activeNode,
      activeNodeId,
      createHighlightNodeFromSelection,
      createQANodeFromSelection,
      editorRef,
      isTrashViewOpen: isViewingTrashNode,
      updateNodeContent
    });

  const saveActiveNodeView = useCallback(() => {
    if (isViewingTrashNode || !activeNodeId || !editorRef.current) {
      return;
    }

    setNodeViewState(activeNodeId, {
      scrollTop: editorRef.current.getScrollTop(),
      selection: editorRef.current.getSelection()
    });
  }, [activeNodeId, isViewingTrashNode, setNodeViewState]);

  const {
    canGoBack,
    canGoForward,
    canGoParent,
    handleGoBack,
    handleGoForward,
    handleGoParent,
    handleSelectBreadcrumbNode: handleSelectBreadcrumbNodeRaw,
    handleSelectNode: handleSelectNoteNode
  } = useWorkspaceNavigation({
    activeNodeContent: activeNode?.content ?? null,
    activeNodeId,
    activeNodeParentId: activeNode?.parentNodeId ?? null,
    backStackSize: navigation.backStack.length,
    closeContextMenu,
    editorRef,
    forwardStackSize: navigation.forwardStack.length,
    goBack,
    goForward,
    goToParent,
    jumpToAncestorNode,
    openNode,
    saveActiveNodeView
  });

  const handleEditorChange = (content: string) => {
    if (isViewingTrashNode) {
      return;
    }
    if (!activeNode) {
      createRootNode(content);
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  };

  const handleAnswerChange = (answer: string) => {
    if (isViewingTrashNode || !activeNodeId) {
      return;
    }
    updateNodeReveal(activeNodeId, answer);
  };

  const handleOpenTrashView = () => {
    setIsSettingsOpen(false);
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    if (isTrashViewOpen) {
      closeTrashView();
    } else {
      openTrashView();
    }
    closeContextMenu();
  };

  const handleOpenNotesView = () => {
    setIsSettingsOpen(false);
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    closeTrashView();
    closeContextMenu();
  };

  const handleToggleListVisibility = () => {
    if (listWidth <= 0) {
      setListWidth(Math.max(220, lastExpandedListWidthRef.current || 300));
      return;
    }
    lastExpandedListWidthRef.current = listWidth;
    setListWidth(0);
  };

  const handleSelectNode = (nodeId: string) => {
    setIsSettingsOpen(false);
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    handleSelectNoteNode(nodeId);
  };

  const handleSelectTrashNode = (nodeId: string) => {
    setIsSettingsOpen(false);
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(true);
    openTrashView();
    setSelectedTrashNodeId(nodeId);
  };

  const handleSelectBreadcrumbNode = (nodeId: string) => {
    setIsSettingsOpen(false);
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    handleSelectBreadcrumbNodeRaw(nodeId);
  };

  const handleStartStudyMode = () => {
    setIsSettingsOpen(false);
    const started = startReviewSession();
    if (!started) {
      return;
    }
    startStudyMode();
  };

  const handleRevealAnswer = () => {
    revealReviewAnswer();
  };

  const handleGradeReview = async (grade: ReviewGrade) => {
    const graded = await gradeReviewCard(grade);
    if (!graded) {
      return;
    }
    if (!useWorkspaceStore.getState().reviewSession.currentNodeId) {
      resetStudyMode();
    }
  };

  const handleOpenSettings = () => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return;
    }
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    closeTrashView();
    closeContextMenu();
    setIsSettingsOpen(true);
  };

  const handleMarkdownSyntaxVisibilityChange = (value: MarkdownSyntaxVisibility) => {
    setMarkdownSyntaxVisibility(value);
    setMarkdownSyntaxVisibilityState(value);
  };

  const handleToggleEditorDisplayMode = () => {
    const nextValue: EditorDisplayMode = editorDisplayMode === 'preview' ? 'source' : 'preview';
    setEditorDisplayMode(nextValue);
    setEditorDisplayModeState(nextValue);
  };

  const handleInterfaceFontPresetChange = (value: InterfaceFontPreset) => {
    setInterfaceFontPreset(value);
    setInterfaceFontPresetState(value);
  };

  const handleBaseColorModeChange = (value: BaseColorMode) => {
    setBaseColorMode(value);
    setBaseColorModeState(value);
  };

  const handleAccentColorPresetChange = (value: AccentColorPreset) => {
    setAccentColorPreset(value);
    setAccentColorPresetState(value);
  };

  const handleAccentColorPresetReset = () => {
    setAccentColorPreset(DEFAULT_ACCENT_COLOR_PRESET);
    setAccentColorPresetState(DEFAULT_ACCENT_COLOR_PRESET);
  };

  const handleUiFontPresetChange = (value: InterfaceFontPreset) => {
    setUiFontPreset(value);
    setUiFontPresetState(value);
  };

  const handleCustomUiFontChange = (value: string) => {
    setCustomUiFont(value);
    setCustomUiFontState(value);
  };

  const handleCustomInterfaceFontChange = (value: string) => {
    setCustomInterfaceFont(value);
    setCustomInterfaceFontState(value);
  };

  const handleMonospaceFontPresetChange = (value: MonospaceFontPreset) => {
    setMonospaceFontPreset(value);
    setMonospaceFontPresetState(value);
  };

  const handleCustomMonospaceFontChange = (value: string) => {
    setCustomMonospaceFont(value);
    setCustomMonospaceFontState(value);
  };

  const handleInterfaceFontSizeChange = (value: number) => {
    setInterfaceFontSize(value);
    setInterfaceFontSizeState(value);
  };

  const handleInterfaceFontSizeReset = () => {
    setInterfaceFontSize(INTERFACE_FONT_SIZE_DEFAULT);
    setInterfaceFontSizeState(INTERFACE_FONT_SIZE_DEFAULT);
  };

  useEffect(() => {
    if (!isViewingTrashNode) {
      return;
    }
    if (!isTrashViewOpen || !selectedTrashNodeId || !trashedNodeIds.includes(selectedTrashNodeId)) {
      setIsViewingTrashNode(false);
    }
  }, [isTrashViewOpen, isViewingTrashNode, selectedTrashNodeId, trashedNodeIds]);

  useEffect(() => {
    if (!isStudyMode || reviewSession.currentNodeId) {
      return;
    }
    resetStudyMode();
  }, [isStudyMode, resetStudyMode, reviewSession.currentNodeId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveActiveNodeView();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveActiveNodeView();
    };
  }, [saveActiveNodeView]);

  useEffect(() => {
    const disableNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', disableNativeContextMenu);
    return () => {
      window.removeEventListener('contextmenu', disableNativeContextMenu);
    };
  }, []);

  const commandContext = useMemo(
    () => ({
      canGoBack,
      canGoForward,
      canGoParent,
      canStartStudyMode,
      isCommandPaletteOpen,
      isSettingsOpen,
      isStudyMode,
      isAnswerRevealed: reviewSession.isAnswerRevealed
    }),
    [
      canGoBack,
      canGoForward,
      canGoParent,
      canStartStudyMode,
      isCommandPaletteOpen,
      isSettingsOpen,
      isStudyMode,
      reviewSession.isAnswerRevealed
    ]
  );

  const resolvedCommandShortcutMap = useMemo(
    () =>
      resolveCommandShortcutMap({
        commandIds: Object.values(APP_COMMAND_IDS),
        defaults: DEFAULT_APP_COMMAND_SHORTCUTS,
        overrides: commandShortcutOverrides
      }),
    [commandShortcutOverrides]
  );

  const updateShortcutOverrides = useCallback((nextOverrides: CommandShortcutOverrides) => {
    setCommandShortcutOverridesState(nextOverrides);
    setCommandShortcutOverrides(nextOverrides);
  }, []);

  const appCommands = useMemo<CommandRegistration[]>(
    () => [
      {
        id: APP_COMMAND_IDS.toggleCommandPaletteMac,
        title: 'Toggle Command Palette',
        section: 'System',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.toggleCommandPaletteMac],
        keywords: ['commands', 'search'],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.toggleCommandPaletteMac],
        execute: () => {
          setIsCommandPaletteOpen((open) => !open);
        }
      },
      {
        id: APP_COMMAND_IDS.toggleCommandPaletteWin,
        title: 'Toggle Command Palette',
        section: 'System',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.toggleCommandPaletteWin],
        keywords: ['commands', 'search'],
        palette: false,
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.toggleCommandPaletteWin],
        execute: () => {
          setIsCommandPaletteOpen((open) => !open);
        }
      },
      {
        id: APP_COMMAND_IDS.closeCommandPalette,
        title: 'Close Command Palette',
        section: 'System',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.closeCommandPalette],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.closeCommandPalette],
        isEnabled: (context) => Boolean(context.isCommandPaletteOpen),
        execute: () => {
          setIsCommandPaletteOpen(false);
        }
      },
      {
        id: APP_COMMAND_IDS.closeSettings,
        title: 'Close Settings',
        section: 'System',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.closeSettings],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.closeSettings],
        isEnabled: (context) => Boolean(context.isSettingsOpen),
        execute: () => {
          setIsSettingsOpen(false);
        }
      },
      {
        id: APP_COMMAND_IDS.closeContextMenu,
        title: 'Close Context Menu',
        section: 'System',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.closeContextMenu],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.closeContextMenu],
        execute: () => {
          closeContextMenu();
        }
      },
      {
        id: APP_COMMAND_IDS.goBack,
        title: 'Go Back',
        section: 'Navigation',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.goBack],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.goBack],
        isEnabled: (context) => Boolean(context.canGoBack),
        execute: handleGoBack
      },
      {
        id: APP_COMMAND_IDS.goForward,
        title: 'Go Forward',
        section: 'Navigation',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.goForward],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.goForward],
        isEnabled: (context) => Boolean(context.canGoForward),
        execute: handleGoForward
      },
      {
        id: APP_COMMAND_IDS.goParent,
        title: 'Go to Parent Node',
        section: 'Navigation',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.goParent],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.goParent],
        isEnabled: (context) => Boolean(context.canGoParent),
        execute: handleGoParent
      },
      {
        id: APP_COMMAND_IDS.toggleEditorDisplayMode,
        title: editorDisplayMode === 'preview' ? 'Switch to Source Mode' : 'Switch to Live Preview',
        section: 'Editor',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.toggleEditorDisplayMode],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.toggleEditorDisplayMode],
        keywords: ['preview', 'source', 'markdown'],
        execute: handleToggleEditorDisplayMode
      },
      {
        id: APP_COMMAND_IDS.startStudyMode,
        title: 'Start Study Mode',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.startStudyMode],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.startStudyMode],
        isEnabled: (context) => Boolean(context.canStartStudyMode) && !context.isStudyMode,
        execute: handleStartStudyMode
      },
      {
        id: APP_COMMAND_IDS.revealReviewAnswer,
        title: 'Show Answer',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.revealReviewAnswer],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.revealReviewAnswer],
        isEnabled: (context) => Boolean(context.isStudyMode) && !context.isAnswerRevealed,
        execute: handleRevealAnswer
      },
      {
        id: APP_COMMAND_IDS.gradeReviewAgain,
        title: 'Grade: Again (1)',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.gradeReviewAgain],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.gradeReviewAgain],
        isEnabled: (context) => Boolean(context.isStudyMode) && Boolean(context.isAnswerRevealed),
        execute: () => {
          void handleGradeReview(1);
        }
      },
      {
        id: APP_COMMAND_IDS.gradeReviewHard,
        title: 'Grade: Hard (2)',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.gradeReviewHard],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.gradeReviewHard],
        isEnabled: (context) => Boolean(context.isStudyMode) && Boolean(context.isAnswerRevealed),
        execute: () => {
          void handleGradeReview(2);
        }
      },
      {
        id: APP_COMMAND_IDS.gradeReviewGood,
        title: 'Grade: Good (3)',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.gradeReviewGood],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.gradeReviewGood],
        isEnabled: (context) => Boolean(context.isStudyMode) && Boolean(context.isAnswerRevealed),
        execute: () => {
          void handleGradeReview(3);
        }
      },
      {
        id: APP_COMMAND_IDS.gradeReviewEasy,
        title: 'Grade: Easy (4)',
        section: 'Review',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.gradeReviewEasy],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.gradeReviewEasy],
        isEnabled: (context) => Boolean(context.isStudyMode) && Boolean(context.isAnswerRevealed),
        execute: () => {
          void handleGradeReview(4);
        }
      },
      {
        id: APP_COMMAND_IDS.openNotes,
        title: 'Open Notes',
        section: 'Workspace',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.openNotes],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.openNotes],
        execute: handleOpenNotesView
      },
      {
        id: APP_COMMAND_IDS.openTrash,
        title: 'Open Trash',
        section: 'Workspace',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.openTrash],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.openTrash],
        execute: handleOpenTrashView
      },
      {
        id: APP_COMMAND_IDS.openSettings,
        title: 'Open Settings',
        section: 'Workspace',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.openSettings],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.openSettings],
        execute: () => {
          setIsCommandPaletteOpen(false);
          handleOpenSettings();
        }
      },
      {
        id: APP_COMMAND_IDS.toggleList,
        title: 'Toggle Left Panel',
        section: 'Workspace',
        shortcutScope: COMMAND_SHORTCUT_SCOPE_BY_ID[APP_COMMAND_IDS.toggleList],
        shortcut: resolvedCommandShortcutMap[APP_COMMAND_IDS.toggleList],
        execute: handleToggleListVisibility
      }
    ],
    [
      canGoBack,
      canGoForward,
      canGoParent,
      closeContextMenu,
      handleGoBack,
      handleGoForward,
      handleGoParent,
      handleOpenNotesView,
      handleOpenSettings,
      handleOpenTrashView,
      handleRevealAnswer,
      handleGradeReview,
      handleStartStudyMode,
      handleToggleEditorDisplayMode,
      handleToggleListVisibility,
      canStartStudyMode,
      editorDisplayMode,
      isStudyMode,
      resolvedCommandShortcutMap
    ]
  );
  const appCommandRegistry = useMemo(() => createCommandRegistry(appCommands, () => commandContext), [appCommands, commandContext]);
  const enabledCommandIds = useMemo(
    () =>
      appCommandRegistry
        .getCommandStates()
        .filter((item) => item.enabled)
        .map((item) => item.id),
    [appCommandRegistry]
  );
  const commandPaletteItems = useMemo(() => appCommandRegistry.getPaletteItems(), [appCommandRegistry]);
  const commandShortcutConflicts = useMemo(
    () =>
      buildCommandShortcutConflictMap(
        appCommands.map((command) => ({
          commandId: command.id,
          title: command.title,
          section: command.section,
          scope: command.shortcutScope ?? DEFAULT_SHORTCUT_SCOPE,
          shortcut: command.shortcut
        }))
      ),
    [appCommands]
  );
  const hotkeyItems = useMemo<HotkeySettingItem[]>(
    () =>
      appCommands
        .filter((command) => command.id !== APP_COMMAND_IDS.closeContextMenu)
        .map((command) => {
          const shortcut = command.shortcut;
          const conflict = commandShortcutConflicts[command.id];
          return {
            commandId: command.id,
            title: command.title,
            section: command.section,
            shortcutLabel: shortcut ? formatShortcutLabel(shortcut) : '',
            isCustomized: Boolean(commandShortcutOverrides[command.id]),
            conflictSeverity: conflict?.severity,
            conflictMessage: conflict?.message
          };
        })
        .sort((left, right) => {
          const bySection = (left.section ?? 'Other').localeCompare(right.section ?? 'Other');
          if (bySection !== 0) {
            return bySection;
          }
          return left.title.localeCompare(right.title);
        }),
    [appCommands, commandShortcutConflicts, commandShortcutOverrides]
  );

  const handleHotkeyUpdate = useCallback(
    (commandId: string, nextLabel: string): HotkeyUpdateResult => {
      const normalizedInput = nextLabel.trim();
      if (!normalizedInput) {
        const nextOverrides = { ...commandShortcutOverrides };
        delete nextOverrides[commandId];
        updateShortcutOverrides(nextOverrides);
        return { status: 'applied', normalizedShortcutLabel: '' };
      }

      const parsedShortcut = parseShortcutLabel(normalizedInput);
      if (!parsedShortcut) {
        return { status: 'invalid', message: 'Shortcut format is invalid. Example: Ctrl+Shift+K' };
      }

      const nextOverrides = {
        ...commandShortcutOverrides,
        [commandId]: buildShortcutOverrideLabel(parsedShortcut)
      };
      const candidateShortcutMap = resolveCommandShortcutMap({
        commandIds: Object.values(APP_COMMAND_IDS),
        defaults: DEFAULT_APP_COMMAND_SHORTCUTS,
        overrides: nextOverrides
      });
      const candidateConflicts = buildCommandShortcutConflictMap(
        appCommands.map((command) => ({
          commandId: command.id,
          title: command.title,
          section: command.section,
          scope: command.shortcutScope ?? DEFAULT_SHORTCUT_SCOPE,
          shortcut: candidateShortcutMap[command.id]
        }))
      );
      const conflict = candidateConflicts[commandId];
      if (conflict?.severity === 'error') {
        return { status: 'blocked', message: conflict.message };
      }

      updateShortcutOverrides(nextOverrides);
      return {
        status: 'applied',
        normalizedShortcutLabel: formatShortcutLabel(parsedShortcut),
        message: conflict?.message
      };
    },
    [appCommands, commandShortcutOverrides, updateShortcutOverrides]
  );

  const handleHotkeyReset = useCallback(
    (commandId: string) => {
      const nextOverrides = { ...commandShortcutOverrides };
      delete nextOverrides[commandId];
      updateShortcutOverrides(nextOverrides);
    },
    [commandShortcutOverrides, updateShortcutOverrides]
  );

  const handleHotkeyResetAll = useCallback(() => {
    updateShortcutOverrides({});
  }, [updateShortcutOverrides]);

  const trackCommandUsage = useCallback((commandId: string) => {
    setRecentCommandIdsState((current) => {
      const next = pushRecentCommandId(current, commandId);
      setRecentCommandIds(next);
      return next;
    });
  }, []);

  const handleRunPaletteCommand = useCallback(
    (commandId: string) => {
      const handled = appCommandRegistry.runById(commandId);
      if (handled) {
        trackCommandUsage(commandId);
        setIsCommandPaletteOpen(false);
      }
    },
    [appCommandRegistry, trackCommandUsage]
  );
  const runCommand = useCallback(
    (commandId: AppCommandId) => {
      appCommandRegistry.runById(commandId);
    },
    [appCommandRegistry]
  );

  useEffect(() => {
    const handleAppHotkeys = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      appCommandRegistry.runByShortcut(event);
    };

    return onWindowKeydown(handleAppHotkeys);
  }, [appCommandRegistry]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void onNativeMenuCommand((commandId) => {
      if (!isAppCommandId(commandId)) {
        return;
      }
      runCommand(commandId);
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {
        unlisten = null;
      });
    return () => {
      unlisten?.();
    };
  }, [runCommand]);

  useEffect(() => {
    void syncNativeMenuState(enabledCommandIds);
  }, [enabledCommandIds]);

  useEffect(() => {
    applyAppearanceSettings({
      baseColor: baseColorMode,
      accentColor: accentColorPreset,
      uiFont: uiFontPreset,
      customUiFont,
      interfaceFont: interfaceFontPreset,
      interfaceFontSize,
      monospaceFont: monospaceFontPreset,
      customInterfaceFont,
      customMonospaceFont
    });
  }, [
    accentColorPreset,
    baseColorMode,
    customInterfaceFont,
    customMonospaceFont,
    customUiFont,
    interfaceFontPreset,
    interfaceFontSize,
    monospaceFontPreset,
    uiFontPreset
  ]);

  return (
    <>
      <WorkspaceLayout
        activeNodeId={activeNodeId}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoParent={canGoParent}
        contextMenu={contextMenu}
        canStartStudyMode={canStartStudyMode}
        documentMaxWidth={documentMaxWidth}
        editorContent={editorContent}
        editorNodeId={editorNodeId}
        editorNodeViewState={activeNodeViewState}
        isStudyMode={isStudyMode}
        isSettingsOpen={isSettingsOpen}
        isDocumentResizing={documentResize.isResizingDocument}
        isResizingList={listResize.isResizingList}
        isTrashViewOpen={isTrashViewOpen}
        isViewingTrashNode={isViewingTrashNode}
        isAnswerRevealed={reviewSession.isAnswerRevealed}
        listWidth={listWidth}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onAnswerChange={handleAnswerChange}
        onCloseContextMenu={closeContextMenu}
        onCreateCloze={handleCreateCloze}
        onCreateHighlight={handleCreateHighlight}
        onEditorChange={handleEditorChange}
        onEditorContextMenu={handleEditorContextMenu}
        onEditorReady={handleEditorReady}
        onGoBack={() => runCommand(APP_COMMAND_IDS.goBack)}
        onGoForward={() => runCommand(APP_COMMAND_IDS.goForward)}
        onGoParent={() => runCommand(APP_COMMAND_IDS.goParent)}
        onGradeReview={(grade) => {
          if (grade === 1) {
            runCommand(APP_COMMAND_IDS.gradeReviewAgain);
            return;
          }
          if (grade === 2) {
            runCommand(APP_COMMAND_IDS.gradeReviewHard);
            return;
          }
          if (grade === 3) {
            runCommand(APP_COMMAND_IDS.gradeReviewGood);
            return;
          }
          runCommand(APP_COMMAND_IDS.gradeReviewEasy);
        }}
        onResetLayout={resetLayout}
        onRevealAnswer={() => runCommand(APP_COMMAND_IDS.revealReviewAnswer)}
        onSelectBreadcrumbNode={handleSelectBreadcrumbNode}
        onSelectNode={handleSelectNode}
        onSelectTrashNode={handleSelectTrashNode}
        onSplitterKeyDown={listResize.handleSplitterKeyDown}
        onSplitterPointerDown={listResize.handleSplitterPointerDown}
        onStartDocumentResize={documentResize.startResize}
        onStartStudyMode={() => runCommand(APP_COMMAND_IDS.startStudyMode)}
        onOpenSettings={() => runCommand(APP_COMMAND_IDS.openSettings)}
        onCloseSettings={() => runCommand(APP_COMMAND_IDS.closeSettings)}
        onBaseColorModeChange={handleBaseColorModeChange}
        onAccentColorPresetChange={handleAccentColorPresetChange}
        onAccentColorPresetReset={handleAccentColorPresetReset}
        onInterfaceFontPresetChange={handleInterfaceFontPresetChange}
        onUiFontPresetChange={handleUiFontPresetChange}
        onCustomUiFontChange={handleCustomUiFontChange}
        onCustomInterfaceFontChange={handleCustomInterfaceFontChange}
        onMonospaceFontPresetChange={handleMonospaceFontPresetChange}
        onCustomMonospaceFontChange={handleCustomMonospaceFontChange}
        onInterfaceFontSizeChange={handleInterfaceFontSizeChange}
        onInterfaceFontSizeReset={handleInterfaceFontSizeReset}
        onMarkdownSyntaxVisibilityChange={handleMarkdownSyntaxVisibilityChange}
        onToggleEditorDisplayMode={() => runCommand(APP_COMMAND_IDS.toggleEditorDisplayMode)}
        onOpenNotesView={() => runCommand(APP_COMMAND_IDS.openNotes)}
        onOpenTrashView={() => runCommand(APP_COMMAND_IDS.openTrash)}
        onToggleListVisibility={() => runCommand(APP_COMMAND_IDS.toggleList)}
        customUiFont={customUiFont}
        customInterfaceFont={customInterfaceFont}
        customMonospaceFont={customMonospaceFont}
        baseColorMode={baseColorMode}
        accentColorPreset={accentColorPreset}
        uiFontPreset={uiFontPreset}
        interfaceFontPreset={interfaceFontPreset}
        interfaceFontSize={interfaceFontSize}
        hotkeyItems={hotkeyItems}
        markdownSyntaxVisibility={markdownSyntaxVisibility}
        editorDisplayMode={editorDisplayMode}
        monospaceFontPreset={monospaceFontPreset}
        selectedTrashNodeId={selectedTrashNodeId}
        showAnswerSection={!isStudyMode || reviewSession.isAnswerRevealed}
        onHotkeyUpdate={handleHotkeyUpdate}
        onHotkeyReset={handleHotkeyReset}
        onHotkeyResetAll={handleHotkeyResetAll}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        items={commandPaletteItems}
        recentCommandIds={recentCommandIds}
        onClose={() => setIsCommandPaletteOpen(false)}
        onRunCommand={handleRunPaletteCommand}
      />
    </>
  );
}
