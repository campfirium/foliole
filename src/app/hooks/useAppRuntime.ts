import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import { getRecentCommandIds, pushRecentCommandId, setRecentCommandIds } from '../../shared/commands/recentCommands';
import { onWindowKeydown } from '../../shared/platform/keyboard';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import { getRecentNodeIds, pushRecentNodeId, setRecentNodeIds } from '../components/nodePaletteRecents';

interface CommandPaletteToggleShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ReadingPositionSyncState {
  reason: string;
  startedAt: number;
  targetSelection: EditorSelection;
  targetViewportRatio?: number;
}

export function isDevToolsToggleShortcut(event: CommandPaletteToggleShortcutEvent) {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    event.shiftKey &&
    event.key.toLowerCase() === 'i'
  );
}

export function isCommandPaletteToggleShortcut(event: CommandPaletteToggleShortcutEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'p'
  );
}

export function isSearchPaletteToggleShortcut(event: CommandPaletteToggleShortcutEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}

function useWindowHotkeys(args: {
  setIsCommandPaletteOpen: (update: (open: boolean) => boolean) => void;
  setIsGoToNodePaletteOpen: (open: boolean) => void;
  setIsMoveToNodePaletteOpen: (open: boolean) => void;
  setIsSearchPaletteOpen: (update: (open: boolean) => boolean) => void;
}) {
  useEffect(
    () =>
      onWindowKeydown((event) => {
        if (isDevToolsToggleShortcut(event)) {
          event.preventDefault();
          void toggleMainWindowDevTools();
          return;
        }
        if (isCommandPaletteToggleShortcut(event)) {
          event.preventDefault();
          args.setIsSearchPaletteOpen(() => false);
          args.setIsGoToNodePaletteOpen(false);
          args.setIsMoveToNodePaletteOpen(false);
          args.setIsCommandPaletteOpen((open) => !open);
          return;
        }
        if (isSearchPaletteToggleShortcut(event)) {
          event.preventDefault();
          args.setIsCommandPaletteOpen(() => false);
          args.setIsGoToNodePaletteOpen(false);
          args.setIsMoveToNodePaletteOpen(false);
          args.setIsSearchPaletteOpen((open) => !open);
        }
      }),
    [args]
  );
}

function useSettingsRequestState() {
  const [requestedSettingsCategory, setRequestedSettingsCategory] = useState<SettingsCategoryId | null>(null);
  const [requestedSettingsDialog, setRequestedSettingsDialog] = useState<'readwise-reader' | null>(null);
  return {
    requestedSettingsCategory,
    requestedSettingsDialog,
    setRequestedSettingsCategory,
    setRequestedSettingsDialog
  };
}

function useRecentHistory() {
  const [recentCommandIds, setRecentCommandIdsState] = useState<string[]>(() => getRecentCommandIds());
  const [recentNodeIds, setRecentNodeIdsState] = useState<string[]>(() => getRecentNodeIds());

  return {
    recentCommandIds,
    recentNodeIds,
    recordRecentCommand(id: string) {
      setRecentCommandIdsState((current) => {
        const next = pushRecentCommandId(current, id);
        setRecentCommandIds(next);
        return next;
      });
    },
    recordRecentNode(id: string) {
      setRecentNodeIdsState((current) => {
        const next = pushRecentNodeId(current, id);
        setRecentNodeIds(next);
        return next;
      });
    }
  };
}

function createRuntimeRefs(initialListWidth: number, initialRightSidebarWidth: number) {
  return {
    editorRef: useRef<EditorAdapter | null>(null),
    editorDraftCloseFlushRef: useRef<(() => Promise<boolean>) | null>(null),
    editorDraftFlushRef: useRef<(() => boolean) | null>(null),
    readingPositionRef: useRef<{ nodeId: string | null; selection: EditorSelection | null }>({
      nodeId: null,
      selection: null
    }),
    readingPositionSyncRef: useRef<{
      nodeId: string | null;
      state: ReadingPositionSyncState | null;
    }>({
      nodeId: null,
      state: null
    }),
    lastExpandedListWidthRef: useRef(initialListWidth),
    lastExpandedRightSidebarWidthRef: useRef(initialRightSidebarWidth)
  };
}

function buildRuntimeState(args: {
  bumpReadingPositionRequest: () => void;
  recentHistory: ReturnType<typeof useRecentHistory>;
  refs: ReturnType<typeof createRuntimeRefs>;
  requestedSettingsCategory: SettingsCategoryId | null;
  requestedSettingsDialog: 'readwise-reader' | null;
  setIsCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsGoToNodePaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportManagementOpen: Dispatch<SetStateAction<boolean>>;
  setIsImmersiveMode: Dispatch<SetStateAction<boolean>>;
  setIsMoveToNodePaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsSearchPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsViewingTrashNode: Dispatch<SetStateAction<boolean>>;
  setRequestedSettingsCategory: (value: SettingsCategoryId | null) => void;
  setRequestedSettingsDialog: (value: 'readwise-reader' | null) => void;
  state: {
    isCommandPaletteOpen: boolean;
    isGoToNodePaletteOpen: boolean;
    isImmersiveMode: boolean;
    isImportManagementOpen: boolean;
    isMoveToNodePaletteOpen: boolean;
    isSearchPaletteOpen: boolean;
    isSettingsOpen: boolean;
    isViewingTrashNode: boolean;
  };
}) {
  return {
    ...args.refs,
    bumpReadingPositionRequest: args.bumpReadingPositionRequest,
    ...args.state,
    recentCommandIds: args.recentHistory.recentCommandIds,
    recentNodeIds: args.recentHistory.recentNodeIds,
    requestedSettingsCategory: args.requestedSettingsCategory,
    requestedSettingsDialog: args.requestedSettingsDialog,
    recordRecentCommand: args.recentHistory.recordRecentCommand,
    recordRecentNode: args.recentHistory.recordRecentNode,
    setIsCommandPaletteOpen: args.setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen: args.setIsGoToNodePaletteOpen,
    setIsImmersiveMode: args.setIsImmersiveMode,
    setIsImportManagementOpen: args.setIsImportManagementOpen,
    setIsMoveToNodePaletteOpen: args.setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen: args.setIsSearchPaletteOpen,
    setIsSettingsOpen: args.setIsSettingsOpen,
    setRequestedSettingsCategory: args.setRequestedSettingsCategory,
    setRequestedSettingsDialog: args.setRequestedSettingsDialog,
    setIsViewingTrashNode: args.setIsViewingTrashNode
  };
}

function useEditorDraftFlushRegistry(refs: ReturnType<typeof createRuntimeRefs>) {
  const flushPendingEditorDraft = useCallback(() => refs.editorDraftFlushRef.current?.() ?? false, [refs.editorDraftFlushRef]);
  const flushPendingEditorDraftImmediately = useCallback(
    async () => (await refs.editorDraftCloseFlushRef.current?.()) ?? true,
    [refs.editorDraftCloseFlushRef]
  );
  const registerPendingEditorDraftFlush = useCallback(
    (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => {
      refs.editorDraftFlushRef.current = flush;
      refs.editorDraftCloseFlushRef.current = closeFlush;
    },
    [refs.editorDraftCloseFlushRef, refs.editorDraftFlushRef]
  );
  return { flushPendingEditorDraft, flushPendingEditorDraftImmediately, registerPendingEditorDraftFlush };
}

export function useAppRuntime(initialListWidth: number, initialRightSidebarWidth: number) {
  const refs = createRuntimeRefs(initialListWidth, initialRightSidebarWidth);
  const [, setReadingPositionRequestVersion] = useState(0);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearchPaletteOpen, setIsSearchPaletteOpen] = useState(false);
  const [isGoToNodePaletteOpen, setIsGoToNodePaletteOpen] = useState(false);
  const [isMoveToNodePaletteOpen, setIsMoveToNodePaletteOpen] = useState(false);
  const [isImportManagementOpen, setIsImportManagementOpen] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const settingsRequest = useSettingsRequestState();
  const recentHistory = useRecentHistory();

  useWindowHotkeys({
    setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen
  });

  const editorDraftFlush = useEditorDraftFlushRegistry(refs);
  const bumpReadingPositionRequest = useCallback(() => {
    setReadingPositionRequestVersion((current) => current + 1);
  }, []);

  return {
    ...buildRuntimeState({
      bumpReadingPositionRequest,
      recentHistory,
      refs,
      requestedSettingsCategory: settingsRequest.requestedSettingsCategory,
      requestedSettingsDialog: settingsRequest.requestedSettingsDialog,
      setIsCommandPaletteOpen,
      setIsGoToNodePaletteOpen,
      setIsImportManagementOpen,
      setIsImmersiveMode,
      setIsMoveToNodePaletteOpen,
      setIsSearchPaletteOpen,
      setIsSettingsOpen,
      setIsViewingTrashNode,
      setRequestedSettingsCategory: settingsRequest.setRequestedSettingsCategory,
      setRequestedSettingsDialog: settingsRequest.setRequestedSettingsDialog,
      state: {
        isCommandPaletteOpen,
        isGoToNodePaletteOpen,
        isImmersiveMode,
        isImportManagementOpen,
        isMoveToNodePaletteOpen,
        isSearchPaletteOpen,
        isSettingsOpen,
        isViewingTrashNode
      }
    }),
    ...editorDraftFlush
  };
}
