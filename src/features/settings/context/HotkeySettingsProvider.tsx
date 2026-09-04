import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { PublicCommandProvider } from '../../../shared/commands/publicCommandContext';
import type { CommandPaletteItem } from '../../../shared/commands/types';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

import {
  CommandShortcutMapContext,
  HotkeySettingsContext,
  type CommandShortcutMap,
  useCommandShortcutMap,
  useHotkeySettings
} from './hotkeySettingsContext';

interface HotkeySettingsProviderProps {
  children: ReactNode;
  hotkeyItems: HotkeySettingItem[];
  publicCommandItems?: CommandPaletteItem[];
  onRunPublicCommand?: (commandId: string) => void;
  shortcutMap?: CommandShortcutMap;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (
    commandId: string,
    slot: 'primary' | 'secondary',
    nextLabel: string
  ) => HotkeyUpdateResult;
}

export function HotkeySettingsProvider(props: HotkeySettingsProviderProps) {
  const [requestedCommandId, setRequestedCommandId] = useState<string | null>(null);
  const onConfigureShortcut = useCallback((commandId: string) => {
    setRequestedCommandId(commandId);
  }, []);
  const onRequestedCommandConsumed = useCallback(() => setRequestedCommandId(null), []);
  const value = useMemo(
    () => ({
      hotkeyItems: props.hotkeyItems,
      onConfigureShortcut,
      onHotkeyReset: props.onHotkeyReset,
      onHotkeyResetAll: props.onHotkeyResetAll,
      onHotkeyUpdate: props.onHotkeyUpdate,
      onRequestedCommandConsumed,
      requestedCommandId
    }),
    [
      onConfigureShortcut,
      onRequestedCommandConsumed,
      props.hotkeyItems,
      props.onHotkeyReset,
      props.onHotkeyResetAll,
      props.onHotkeyUpdate,
      requestedCommandId
    ]
  );

  return (
    <PublicCommandProvider
      items={props.publicCommandItems ?? []}
      runCommand={props.onRunPublicCommand ?? (() => undefined)}
    >
      <CommandShortcutMapContext.Provider value={props.shortcutMap ?? {}}>
        <HotkeySettingsContext.Provider value={value}>
          {props.children}
        </HotkeySettingsContext.Provider>
      </CommandShortcutMapContext.Provider>
    </PublicCommandProvider>
  );
}

export { useCommandShortcutMap, useHotkeySettings };
