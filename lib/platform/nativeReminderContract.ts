import type { ReminderRule } from '../core/reminders/reminderRule.js';

export const NATIVE_REMINDER_COMMANDS = {
  loadDesktopReminders: 'load_desktop_reminders',
  saveDesktopReminder: 'save_desktop_reminder'
} as const;

export type DesktopReminderDraft = Pick<ReminderRule, 'message' | 'enabled'> & {
  time: string;
  previous?: Pick<ReminderRule, 'id' | 'revision'>;
};

export interface NativeReminderCommandMap {
  [NATIVE_REMINDER_COMMANDS.loadDesktopReminders]: { args: undefined; result: ReminderRule[] };
  [NATIVE_REMINDER_COMMANDS.saveDesktopReminder]: { args: DesktopReminderDraft; result: ReminderRule };
}
