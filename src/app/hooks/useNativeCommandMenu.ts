import { useEffect } from 'react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { resolveNativeMenuAccelerator } from '../../shared/commands/nativeAccelerators';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { onNativeMenuCommand, syncNativeMenuState } from '../../shared/platform/commandMenu';

import { ownsTextHistory, runFocusedTextHistory } from './commandTextHistory';

export function useNativeCommandMenu(items: CommandPaletteItem[], onRunCommand: (id: string) => void) {
  useEffect(() => {
    const sync = () => { void syncNativeMenuState({
      history: { undoTitle: items.find(item => item.id === APP_COMMAND_IDS.undo)?.title ?? 'Undo',
        redoTitle: items.find(item => item.id === APP_COMMAND_IDS.redo)?.title ?? 'Redo', nativeEditing: ownsTextHistory(document.activeElement) },
      enabledCommandIds: items.filter((item) => item.enabled).map((item) => item.id),
      shortcutAccelerators: items
        .map((item) => ({
          accelerator: resolveNativeMenuAccelerator(item.shortcuts),
          commandId: item.id
        }))
        .filter((item) => item.accelerator)
    }); };
    sync();
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => { document.removeEventListener('focusin', sync); document.removeEventListener('focusout', sync); };
  }, [items]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void onNativeMenuCommand((commandId) => {
      if (runFocusedTextHistory(commandId)) return;
      onRunCommand(commandId);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onRunCommand]);
}
