import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { CommandShortcutOverrides } from '../../shared/commands/keymap';
import type { CommandPaletteItem } from '../../shared/commands/types';

import { mapPaletteItemsToHotkeyItems } from './reviewHotkeysState';

export interface AppHotkeySettings {
  hotkeyItems: HotkeySettingItem[];
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
}

export function buildHotkeySettings(
  paletteItems: CommandPaletteItem[],
  hotkeys: {
    overrides: CommandShortcutOverrides;
    resetAllShortcuts: () => void;
    resetShortcut: (commandId: string) => void;
    updateShortcut: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  }
): AppHotkeySettings {
  return {
    hotkeyItems: mapPaletteItemsToHotkeyItems(paletteItems, hotkeys.overrides),
    onHotkeyReset: hotkeys.resetShortcut,
    onHotkeyResetAll: hotkeys.resetAllShortcuts,
    onHotkeyUpdate: hotkeys.updateShortcut
  };
}
