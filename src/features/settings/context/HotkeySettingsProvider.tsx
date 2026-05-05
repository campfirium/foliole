import { useMemo, type ReactNode } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

import {
  HotkeySettingsContext,
  useHotkeySettings
} from './hotkeySettingsContext';

interface HotkeySettingsProviderProps {
  children: ReactNode;
  hotkeyItems: HotkeySettingItem[];
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
}

export function HotkeySettingsProvider(props: HotkeySettingsProviderProps) {
  const value = useMemo(
    () => ({
      hotkeyItems: props.hotkeyItems,
      onHotkeyReset: props.onHotkeyReset,
      onHotkeyResetAll: props.onHotkeyResetAll,
      onHotkeyUpdate: props.onHotkeyUpdate
    }),
    [props.hotkeyItems, props.onHotkeyReset, props.onHotkeyResetAll, props.onHotkeyUpdate]
  );

  return <HotkeySettingsContext.Provider value={value}>{props.children}</HotkeySettingsContext.Provider>;
}

export { useHotkeySettings };
