import { useEffect } from 'react';

import { onWindowKeydownCapture } from '../../shared/platform/keyboard';
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

export function shouldHandleDevToolsToggleShortcut(event: CommandPaletteToggleShortcutEvent, canToggleDevTools = import.meta.env.DEV) {
  return canToggleDevTools && isDevToolsToggleShortcut(event);
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

export function useWindowHotkeys(args: {
  canToggleDevTools?: boolean;
  setIsCommandPaletteOpen: (update: (open: boolean) => boolean) => void;
  setIsGoToNodePaletteOpen: (open: boolean) => void;
  setIsMoveToNodePaletteOpen: (open: boolean) => void;
  setIsSearchPaletteOpen: (update: (open: boolean) => boolean) => void;
}) {
  useEffect(
    () =>
      onWindowKeydownCapture((event) => {
        if (shouldHandleDevToolsToggleShortcut(event, args.canToggleDevTools ?? import.meta.env.DEV)) {
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
