import { useEffect } from 'react';

import type { CommandPaletteItem } from '../../shared/commands/types';
import { onNativeMenuCommand, syncNativeMenuState } from '../../shared/platform/commandMenu';

export function useNativeCommandMenu(items: CommandPaletteItem[], onRunCommand: (id: string) => void) {
  useEffect(() => {
    void syncNativeMenuState(items.filter((item) => item.enabled).map((item) => item.id));
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
