import { createContext, useContext } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

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

export function useHotkeySettings() {
  const context = useContext(HotkeySettingsContext);
  if (!context) {
    throw new Error('HotkeySettingsProvider is missing.');
  }
  return context;
}
