import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
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
  const [recentCommandIds, setRecentCommandIdsState] = useState<string[]>(() => getRecentCommandIds());
  const [recentNodeIds, setRecentNodeIdsState] = useState<string[]>(() => getRecentNodeIds());

  useWindowHotkeys({
    setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen
  });

  const recordRecentCommand = (id: string) => {
    setRecentCommandIdsState((current) => {
      const next = pushRecentCommandId(current, id);
      setRecentCommandIds(next);
      return next;
    });
  };
  const recordRecentNode = (id: string) => {
    setRecentNodeIdsState((current) => {
      const next = pushRecentNodeId(current, id);
      setRecentNodeIds(next);
      return next;
    });
  };

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
    recentCommandIds,
    recentNodeIds,
    recordRecentCommand,
    recordRecentNode,
    setIsCommandPaletteOpen,
    setIsGoToNodePaletteOpen,
    setIsImportManagementOpen,
    setIsMoveToNodePaletteOpen,
    setIsSearchPaletteOpen,
    setIsSettingsOpen,
    setIsViewingTrashNode
  };
}
