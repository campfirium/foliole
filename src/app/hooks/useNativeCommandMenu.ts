import { useEffect } from 'react';

import { resolveNativeMenuAccelerator } from '../../shared/commands/nativeAccelerators';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { onNativeMenuCommand, syncNativeMenuState } from '../../shared/platform/commandMenu';

export function useNativeCommandMenu(items: CommandPaletteItem[], onRunCommand: (id: string) => void) {
  useEffect(() => {
    void syncNativeMenuState({
      enabledCommandIds: items.filter((item) => item.enabled).map((item) => item.id),
      shortcutAccelerators: items
        .map((item) => ({
          accelerator: resolveNativeMenuAccelerator(item.shortcuts),
          commandId: item.id
        }))
        .filter((item) => item.accelerator)
    });
  }, [items]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void onNativeMenuCommand((commandId) => {
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
