import type { ReminderRule } from '../core/reminders/reminderRule.js';

export const NATIVE_REMINDER_COMMANDS = {
  desktopReminderNotificationStatus: 'desktop_reminder_notification_status',
  requestDesktopReminderNotificationPermission: 'request_desktop_reminder_notification_permission',
  openDesktopReminderNotificationSettings: 'open_desktop_reminder_notification_settings',
  loadDesktopReminders: 'load_desktop_reminders',
  saveDesktopReminder: 'save_desktop_reminder'
} as const;

export const DESKTOP_REMINDER_OPEN_DIVE_PREFIX = '__reminder_open_dive__:';
export const DESKTOP_REMINDER_OPEN_FLOW = '__reminder_open_flow__';

export type DesktopReminderDraft = Pick<ReminderRule, 'message' | 'enabled' | 'destination' | 'preset'> & {
  trigger: Exclude<ReminderRule['trigger'], { kind: 'once' }>;
  previous?: Pick<ReminderRule, 'id' | 'revision'>;
};

export type DesktopReminderNotificationStatus = 'notDetermined' | 'denied' | 'allowed' | 'unavailable' | 'unsupported';

export interface NativeReminderCommandMap {
  [NATIVE_REMINDER_COMMANDS.desktopReminderNotificationStatus]: {
    args: undefined;
    result: DesktopReminderNotificationStatus;
  };
  [NATIVE_REMINDER_COMMANDS.requestDesktopReminderNotificationPermission]: {
    args: undefined;
    result: DesktopReminderNotificationStatus;
  };
  [NATIVE_REMINDER_COMMANDS.openDesktopReminderNotificationSettings]: { args: undefined; result: null };
  [NATIVE_REMINDER_COMMANDS.loadDesktopReminders]: { args: undefined; result: ReminderRule[] };
  [NATIVE_REMINDER_COMMANDS.saveDesktopReminder]: { args: DesktopReminderDraft; result: ReminderRule };
}
