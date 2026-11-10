import type { ReminderRule } from '../core/reminders/reminderRule.js';

export const NATIVE_REMINDER_COMMANDS = {
  loadDesktopReminders: 'load_desktop_reminders',
  saveDesktopReminder: 'save_desktop_reminder'
} as const;

export const DESKTOP_REMINDER_OPEN_DIVE_PREFIX = '__reminder_open_dive__:';
export const DESKTOP_REMINDER_OPEN_FLOW = '__reminder_open_flow__';

export type DesktopReminderDraft = Pick<ReminderRule, 'message' | 'enabled' | 'destination' | 'preset'> & {
  trigger: Exclude<ReminderRule['trigger'], { kind: 'once' }>;
  previous?: Pick<ReminderRule, 'id' | 'revision'>;
};

export interface NativeReminderCommandMap {
  [NATIVE_REMINDER_COMMANDS.loadDesktopReminders]: { args: undefined; result: ReminderRule[] };
  [NATIVE_REMINDER_COMMANDS.saveDesktopReminder]: { args: DesktopReminderDraft; result: ReminderRule };
}
