import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRecentCommandIds, pushRecentCommandId, setRecentCommandIds } from '../../shared/commands/recentCommands';
import { onWindowKeydown } from '../../shared/platform/keyboard';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';

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

export function useAppRuntime(initialListWidth: number, initialRightSidebarWidth: number) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(initialListWidth);
  const lastExpandedRightSidebarWidthRef = useRef(initialRightSidebarWidth);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isImportManagementOpen, setIsImportManagementOpen] = useState(false);
  const [recentCommandIds, setRecentCommandIdsState] = useState<string[]>(() => getRecentCommandIds());

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
          setIsCommandPaletteOpen((open) => !open);
        }
      }),
    []
  );

  const recordRecentCommand = (id: string) => {
    setRecentCommandIdsState((current) => {
      const next = pushRecentCommandId(current, id);
      setRecentCommandIds(next);
      return next;
    });
  };

  return {
    editorRef,
    isCommandPaletteOpen,
    isImportManagementOpen,
    isSettingsOpen,
    isViewingTrashNode,
    lastExpandedListWidthRef,
    lastExpandedRightSidebarWidthRef,
    recentCommandIds,
    recordRecentCommand,
    setIsCommandPaletteOpen,
    setIsImportManagementOpen,
    setIsSettingsOpen,
    setIsViewingTrashNode
  };
}
