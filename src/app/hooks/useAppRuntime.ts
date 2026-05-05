import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { onWindowKeydown } from '../../shared/platform/keyboard';

interface UseAppRuntimeWorkspace {
  startReviewSession: () => boolean;
}

export function useAppRuntime(ws: UseAppRuntimeWorkspace, startStudyMode: () => void, initialListWidth: number) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const lastExpandedListWidthRef = useRef(initialListWidth);
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
