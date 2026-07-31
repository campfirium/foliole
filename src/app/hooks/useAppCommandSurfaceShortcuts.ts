import { useEffect } from 'react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { resolveCommandShortcutDispatch } from '../../shared/commands/shortcutDispatcher';
import type { CommandPaletteItem, CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydownCapture } from '../../shared/platform/keyboard';

const COMMAND_SURFACE_ENTRY_IDS = new Set<string>([
  APP_COMMAND_IDS.openCommandPalette,
  APP_COMMAND_IDS.openWorkspaceSearch
]);

interface CommandSurfaceShortcutArgs {
  isCommandPaletteOpen: boolean;
  isSearchPaletteOpen: boolean;
  isSettingsOpen: boolean;
  items: CommandPaletteItem[];
  runCommand: (id: string) => void;
  setIsCommandPaletteOpen: (open: boolean) => void;
  setIsSearchPaletteOpen: (open: boolean) => void;
  shortcutMap: Record<string, CommandShortcutSet | undefined>;
}

function runCommandSurfaceShortcut(args: CommandSurfaceShortcutArgs, commandId: string) {
  if (commandId === APP_COMMAND_IDS.openCommandPalette && args.isCommandPaletteOpen) {
    args.setIsCommandPaletteOpen(false);
    return;
  }
  if (commandId === APP_COMMAND_IDS.openWorkspaceSearch && args.isSearchPaletteOpen) {
    args.setIsSearchPaletteOpen(false);
    return;
  }
  args.runCommand(commandId);
}

export function useAppCommandSurfaceShortcuts(args: CommandSurfaceShortcutArgs) {
  useEffect(
    () =>
      onWindowKeydownCapture((event) => {
        if (args.isSettingsOpen) return;
        const commandId = resolveCommandShortcutDispatch({
          event,
          items: args.items.filter((item) => COMMAND_SURFACE_ENTRY_IDS.has(item.id)),
          shortcutMap: args.shortcutMap
        });
        if (!commandId) return;
        event.preventDefault();
        runCommandSurfaceShortcut(args, commandId);
      }),
    [args]
  );
}
