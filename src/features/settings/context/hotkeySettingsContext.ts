import { createContext, useContext } from 'react';

import { getPlatformDefaultCommandShortcuts } from '../../../shared/commands/defaultShortcuts';
import type { CommandShortcutSet } from '../../../shared/commands/types';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

export type CommandShortcutMap = Record<string, CommandShortcutSet | undefined>;

export interface HotkeySettingsContextValue {
  hotkeyItems: HotkeySettingItem[];
  onConfigureShortcut: (commandId: string) => void;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onRequestedCommandConsumed: () => void;
  requestedCommandId: string | null;
}

export const HotkeySettingsContext = createContext<HotkeySettingsContextValue | null>(null);
export const CommandShortcutMapContext = createContext<CommandShortcutMap>(
  getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: true })
);

export function useHotkeySettings() {
  const context = useContext(HotkeySettingsContext);
  if (!context) {
    throw new Error('HotkeySettingsProvider is missing.');
  }
  return context;
}

export function useCommandShortcutMap() {
  return useContext(CommandShortcutMapContext);
}
