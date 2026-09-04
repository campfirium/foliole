import type {
  HotkeySettingItem,
  HotkeyUpdateResult
} from '../../features/settings/model/hotkeySettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import {
  buildShortcutOverrideLabel,
  type CommandShortcutOverrides
} from '../../shared/commands/keymap';
import {
  formatShortcutSetDisplayEntries,
  formatShortcutSetSearchLabel
} from '../../shared/commands/shortcutDisplay';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { resolveSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';

import { mapPaletteItemsToHotkeyItems } from './reviewHotkeysState';

export interface AppHotkeySettings {
  hotkeyItems: HotkeySettingItem[];
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (
    commandId: string,
    slot: 'primary' | 'secondary',
    nextLabel: string
  ) => HotkeyUpdateResult;
  shortcutMap: Record<string, import('../../shared/commands/types').CommandShortcutSet | undefined>;
  publicCommandItems?: CommandPaletteItem[];
  onRunPublicCommand?: (commandId: string) => void;
}

export function buildHotkeySettings(
  paletteItems: CommandPaletteItem[],
  hotkeys: {
    overrides: CommandShortcutOverrides;
    shortcutMap: Record<
      string,
      import('../../shared/commands/types').CommandShortcutSet | undefined
    >;
    resetAllShortcuts: () => void;
    resetShortcut: (commandId: string) => void;
    updateShortcut: (
      commandId: string,
      slot: 'primary' | 'secondary',
      nextLabel: string
    ) => HotkeyUpdateResult;
  }
): AppHotkeySettings {
  const globalCaptureShortcuts = hotkeys.shortcutMap[APP_COMMAND_IDS.globalCaptureToInbox];
  const globalCaptureItem: HotkeySettingItem = {
    commandId: APP_COMMAND_IDS.globalCaptureToInbox,
    isCustomized: Boolean(hotkeys.overrides[APP_COMMAND_IDS.globalCaptureToInbox]),
    primaryShortcutLabel: globalCaptureShortcuts?.primary
      ? buildShortcutOverrideLabel(globalCaptureShortcuts.primary)
      : '',
    secondaryShortcutLabel: globalCaptureShortcuts?.secondary
      ? buildShortcutOverrideLabel(globalCaptureShortcuts.secondary)
      : '',
    section: 'Capture',
    shortcutDisplayEntries: formatShortcutSetDisplayEntries(globalCaptureShortcuts),
    shortcutSummaryLabel: formatShortcutSetSearchLabel(globalCaptureShortcuts),
    title: `Capture to ${resolveSystemEntryDisplayName(getStoredAppLocale(), 'inbox')} (global)`
  };
  return {
    hotkeyItems: [
      globalCaptureItem,
      ...mapPaletteItemsToHotkeyItems(paletteItems, hotkeys.overrides)
    ],
    onHotkeyReset: hotkeys.resetShortcut,
    onHotkeyResetAll: hotkeys.resetAllShortcuts,
    onHotkeyUpdate: hotkeys.updateShortcut,
    shortcutMap: hotkeys.shortcutMap
  };
}
