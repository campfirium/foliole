export type HotkeyValidationStatus = 'applied' | 'blocked' | 'invalid';

export interface HotkeySettingItem {
  commandId: string;
  title: string;
  section?: string;
  shortcutLabel: string;
  isCustomized: boolean;
  conflictSeverity?: 'warning' | 'error';
  conflictMessage?: string;
}

export interface HotkeyUpdateResult {
  status: HotkeyValidationStatus;
  normalizedShortcutLabel?: string;
  message?: string;
}
