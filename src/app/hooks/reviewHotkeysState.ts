import { useCallback, useEffect, useMemo, useState } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import {
  buildShortcutOverrideLabel,
  getCommandShortcutOverrides,
  resolveCommandShortcutMap,
  setCommandShortcutOverrides,
  type CommandShortcutOverrides
} from '../../shared/commands/keymap';
import { formatShortcutSetLabel, parseShortcutLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

export const REVIEW_SHORTCUT_COMMAND_IDS = [
  APP_COMMAND_IDS.revealReviewAnswer,
  APP_COMMAND_IDS.gradeReviewAgain,
  APP_COMMAND_IDS.gradeReviewHard,
  APP_COMMAND_IDS.gradeReviewGood,
  APP_COMMAND_IDS.gradeReviewEasy,
  APP_COMMAND_IDS.readingReviewLater,
  APP_COMMAND_IDS.readingReviewRead,
  APP_COMMAND_IDS.readingReviewDismiss
] as const;

export const DOCUMENT_SHORTCUT_COMMAND_IDS = [APP_COMMAND_IDS.findInTopic] as const;

export function isReviewShortcutCommand(commandId: string) {
  return REVIEW_SHORTCUT_COMMAND_IDS.includes(commandId as (typeof REVIEW_SHORTCUT_COMMAND_IDS)[number]);
}

export function mapPaletteItemsToHotkeyItems(items: CommandPaletteItem[], overrides: CommandShortcutOverrides): HotkeySettingItem[] {
  return items.map((item) => ({
    commandId: item.id,
    title: item.title,
    section: item.section,
    primaryShortcutLabel: item.shortcuts?.primary ? buildShortcutOverrideLabel(item.shortcuts.primary) : '',
    secondaryShortcutLabel: item.shortcuts?.secondary ? buildShortcutOverrideLabel(item.shortcuts.secondary) : '',
    shortcutSummaryLabel: formatShortcutSetLabel(item.shortcuts),
    isCustomized: Boolean(overrides[item.id]?.primary || overrides[item.id]?.secondary)
  }));
}

export function useCommandShortcutState(commandIds: readonly string[]) {
  const [overrides, setOverrides] = useState<CommandShortcutOverrides>(() => getCommandShortcutOverrides());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides) {
        setOverrides(getCommandShortcutOverrides());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const shortcutMap = useMemo(
    () => resolveCommandShortcutMap({ commandIds: [...commandIds], defaults: DEFAULT_APP_COMMAND_SHORTCUTS, overrides }),
    [commandIds, overrides]
  );

  const updateShortcut = useCallback((commandId: string, slot: 'primary' | 'secondary', nextLabel: string): HotkeyUpdateResult => {
    const normalized = nextLabel.trim();
    if (normalized && !parseShortcutLabel(normalized)) {
      return { status: 'invalid', message: 'Shortcut is invalid.' };
    }
    setOverrides((current) => {
      const next = { ...current };
      const entry = { primary: current[commandId]?.primary, secondary: current[commandId]?.secondary, [slot]: normalized || undefined };
      if (!entry.primary && !entry.secondary) {
        delete next[commandId];
      } else {
        next[commandId] = entry;
      }
      setCommandShortcutOverrides(next);
      return next;
    });
    return { status: 'applied', normalizedShortcutLabel: normalized ? buildShortcutOverrideLabel(parseShortcutLabel(normalized)!) : '' };
  }, []);

  const resetShortcut = useCallback((commandId: string) => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[commandId];
      setCommandShortcutOverrides(next);
      return next;
    });
  }, []);

  const resetAllShortcuts = useCallback(() => {
    setOverrides({});
    setCommandShortcutOverrides({});
  }, []);

  return { overrides, resetAllShortcuts, resetShortcut, shortcutMap, updateShortcut };
}
