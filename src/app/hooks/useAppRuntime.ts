import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
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

export function useAppRuntime(initialListWidth: number, initialRightSidebarWidth: number) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(initialListWidth);
  const lastExpandedRightSidebarWidthRef = useRef(initialRightSidebarWidth);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearchPaletteOpen, setIsSearchPaletteOpen] = useState(false);
  const [isGoToNodePaletteOpen, setIsGoToNodePaletteOpen] = useState(false);
  const [isMoveToNodePaletteOpen, setIsMoveToNodePaletteOpen] = useState(false);
  const [isImportManagementOpen, setIsImportManagementOpen] = useState(false);
  const settingsRequest = useSettingsRequestState();
  const recentHistory = useRecentHistory();

  useWindowHotkeys({
    setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen
  });

  return {
    editorRef,
    isCommandPaletteOpen,
    isGoToNodePaletteOpen,
    isImportManagementOpen,
    isMoveToNodePaletteOpen,
    isSearchPaletteOpen,
    isSettingsOpen,
    isViewingTrashNode,
    lastExpandedListWidthRef,
    lastExpandedRightSidebarWidthRef,
    recentCommandIds: recentHistory.recentCommandIds,
    recentNodeIds: recentHistory.recentNodeIds,
    requestedSettingsCategory: settingsRequest.requestedSettingsCategory,
    requestedSettingsDialog: settingsRequest.requestedSettingsDialog,
    recordRecentCommand: recentHistory.recordRecentCommand,
    recordRecentNode: recentHistory.recordRecentNode,
    setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen,
    setIsImportManagementOpen,
    setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen,
    setIsSettingsOpen,
    setRequestedSettingsCategory: settingsRequest.setRequestedSettingsCategory,
    setRequestedSettingsDialog: settingsRequest.setRequestedSettingsDialog,
    setIsViewingTrashNode
  };
}
