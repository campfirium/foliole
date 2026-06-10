import type { ShortcutDisplayEntry } from '../../../shared/commands/shortcutDisplay';

type HotkeyValidationStatus = 'applied' | 'blocked' | 'invalid';

export interface HotkeySettingItem {
  commandId: string;
  title: string;
  section?: string;
  primaryShortcutLabel: string;
  secondaryShortcutLabel: string;
  shortcutSummaryLabel: string;
  shortcutDisplayEntries?: ShortcutDisplayEntry[];
  isCustomized: boolean;
  conflictSeverity?: 'warning' | 'error';
  conflictMessage?: string;
}

export interface HotkeyUpdateResult {
  status: HotkeyValidationStatus;
  normalizedShortcutLabel?: string;
  message?: string;
}
