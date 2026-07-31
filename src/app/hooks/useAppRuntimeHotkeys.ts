import { useEffect } from 'react';

import { onWindowKeydownCapture } from '../../shared/platform/keyboard';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';

interface AppRuntimeShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function isDevToolsToggleShortcut(event: AppRuntimeShortcutEvent) {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    event.shiftKey &&
    event.key.toLowerCase() === 'i'
  );
}

export function shouldHandleDevToolsToggleShortcut(event: AppRuntimeShortcutEvent, canToggleDevTools = import.meta.env.DEV) {
  return canToggleDevTools && isDevToolsToggleShortcut(event);
}

export function useWindowHotkeys(canToggleDevTools = import.meta.env.DEV) {
  useEffect(
    () =>
      onWindowKeydownCapture((event) => {
        if (shouldHandleDevToolsToggleShortcut(event, canToggleDevTools)) {
          event.preventDefault();
          void toggleMainWindowDevTools();
        }
      }),
    [canToggleDevTools]
  );
}
