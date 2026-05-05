import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRecentCommandIds, pushRecentCommandId, setRecentCommandIds } from '../../shared/commands/recentCommands';
import { onWindowKeydown } from '../../shared/platform/keyboard';

interface CommandPaletteToggleShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function isCommandPaletteToggleShortcut(event: CommandPaletteToggleShortcutEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'p'
  );
}

export function useAppRuntime(initialListWidth: number) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(initialListWidth);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [recentCommandIds, setRecentCommandIdsState] = useState<string[]>(() => getRecentCommandIds());

  useEffect(
    () =>
      onWindowKeydown((event) => {
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
    isSettingsOpen,
    isViewingTrashNode,
    lastExpandedListWidthRef,
    recentCommandIds,
    recordRecentCommand,
    setIsCommandPaletteOpen,
    setIsSettingsOpen,
    setIsViewingTrashNode
  };
}
