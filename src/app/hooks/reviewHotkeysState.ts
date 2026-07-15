import { useCallback, useEffect, useMemo, useState } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import {
  buildShortcutOverrideLabel,
  getCommandShortcutOverrides,
  resolveCommandShortcutMap,
  setCommandShortcutOverrides,
  type CommandShortcutOverrides
} from '../../shared/commands/keymap';
import { formatShortcutSetDisplayEntries, formatShortcutSetSearchLabel } from '../../shared/commands/shortcutDisplay';
import { parseShortcutLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { definedProps } from '../../shared/lib/definedProps';

export const REVIEW_SHORTCUT_COMMAND_IDS = [
  APP_COMMAND_IDS.revealReviewAnswer,
  APP_COMMAND_IDS.gradeReviewAgain,
  APP_COMMAND_IDS.gradeReviewHard,
  APP_COMMAND_IDS.gradeReviewGood,
  APP_COMMAND_IDS.gradeReviewEasy,
  APP_COMMAND_IDS.readingReviewSoon,
  APP_COMMAND_IDS.readingReviewLater,
  APP_COMMAND_IDS.readingReviewRead,
  APP_COMMAND_IDS.readingReviewDismiss,
  APP_COMMAND_IDS.reviewScrollReadingDown,
  APP_COMMAND_IDS.reviewScrollReadingUp,
  APP_COMMAND_IDS.deleteCurrentReviewItem,
  APP_COMMAND_IDS.reviewNavigateParent,
  APP_COMMAND_IDS.reviewNavigateBack,
  APP_COMMAND_IDS.reviewNavigateForward,
  APP_COMMAND_IDS.reviewNavigateDown,
  APP_COMMAND_IDS.reviewNavigatePreviousSibling,
  APP_COMMAND_IDS.reviewNavigateNextSibling,
  APP_COMMAND_IDS.deleteReviewSourceTopic
] as const;

export const DOCUMENT_SHORTCUT_COMMAND_IDS = [APP_COMMAND_IDS.findInTopic, APP_COMMAND_IDS.enterPriorityMode] as const;

export const APP_SHORTCUT_COMMAND_IDS = Object.values(APP_COMMAND_IDS);

export function mapPaletteItemsToHotkeyItems(items: CommandPaletteItem[], overrides: CommandShortcutOverrides): HotkeySettingItem[] {
  return items.map((item) => {
    const shortcutDisplayEntries = formatShortcutSetDisplayEntries(item.shortcuts);
    return {
      commandId: item.id,
      title: item.title,
      primaryShortcutLabel: item.shortcuts?.primary ? buildShortcutOverrideLabel(item.shortcuts.primary) : '',
      secondaryShortcutLabel: item.shortcuts?.secondary ? buildShortcutOverrideLabel(item.shortcuts.secondary) : '',
      shortcutSummaryLabel: formatShortcutSetSearchLabel(item.shortcuts),
      shortcutDisplayEntries,
      isCustomized: Boolean(overrides[item.id]?.primary || overrides[item.id]?.secondary),
      ...definedProps({ section: item.section })
    };
  });
}

export function useCommandShortcutState(commandIds: readonly string[]) {
  const [overrides, setOverrides] = useState<CommandShortcutOverrides>(() => getCommandShortcutOverrides());
  const defaultShortcuts = useMemo(() => getPlatformDefaultCommandShortcuts(), []);

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
    () => resolveCommandShortcutMap({ commandIds: [...commandIds], defaults: defaultShortcuts, overrides }),
    [commandIds, defaultShortcuts, overrides]
  );

  const updateShortcut = useCallback((commandId: string, slot: 'primary' | 'secondary', nextLabel: string): HotkeyUpdateResult => {
    const normalized = nextLabel.trim();
    if (normalized && !parseShortcutLabel(normalized)) {
      return { status: 'invalid', message: 'Shortcut is invalid.' };
    }
    setOverrides((current) => {
      const next = { ...current };
      const entry = definedProps({
        primary: slot === 'primary' ? normalized || undefined : current[commandId]?.primary,
        secondary: slot === 'secondary' ? normalized || undefined : current[commandId]?.secondary
      });
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
