import { LocalNotifications } from '@capacitor/local-notifications';

import { isNativeCompanionRuntime } from './companionBootstrap';

export type HandoffReminderDelay = 'off' | '2' | '5' | '15' | '30' | '60' | '180';

export interface CompanionHandoffReminderScheduleSettings {
  fixedTime: string | null;
  shortDelay: HandoffReminderDelay;
}

const SHORT_REMINDER_ID = 420101;
const DAILY_REMINDER_ID = 420102;
const REMINDER_IDS = [SHORT_REMINDER_ID, DAILY_REMINDER_ID];

function parseFixedTime(value: string | null) {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

export function getNextFixedReminderTime(value: string | null, now = new Date()) {
  const fixedTime = parseFixedTime(value);
  if (!fixedTime) {
    return null;
  }
  const next = new Date(now);
  next.setHours(fixedTime.hour, fixedTime.minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getShortReminderTime(delay: HandoffReminderDelay, now = new Date()) {
  if (delay === 'off') {
    return null;
  }
  return new Date(now.getTime() + Number(delay) * 60_000);
}

export function buildHandoffReminderNotifications(args: {
  dirtyCount: number;
  now?: Date;
  settings: CompanionHandoffReminderScheduleSettings;
}) {
  if (args.dirtyCount <= 0) {
    return [];
  }
  const now = args.now ?? new Date();
  const shortTime = getShortReminderTime(args.settings.shortDelay, now);
  const fixedTime = getNextFixedReminderTime(args.settings.fixedTime, now);
  return [
    shortTime
      ? {
          body: 'Open Foliole to hand off this device before continuing elsewhere.',
          id: SHORT_REMINDER_ID,
          schedule: { at: shortTime },
          title: 'Foliole handoff reminder'
        }
      : null,
    fixedTime
      ? {
          body: 'This device still has local changes waiting to be handed off.',
          id: DAILY_REMINDER_ID,
          schedule: { at: fixedTime },
          title: 'Foliole handoff reminder'
        }
      : null
  ].filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));
}

async function cancelHandoffReminders() {
  await LocalNotifications.cancel({
    notifications: REMINDER_IDS.map((id) => ({ id }))
  });
}

async function ensureNotificationPermission() {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'granted') {
    return true;
  }
  if (permission.display !== 'prompt' && permission.display !== 'prompt-with-rationale') {
    return false;
  }
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
}

export async function scheduleCompanionHandoffReminders(args: {
  dirtyCount: number;
  now?: Date;
  settings: CompanionHandoffReminderScheduleSettings;
}) {
  if (!isNativeCompanionRuntime()) {
    return { scheduled: 0, status: 'unavailable' as const };
  }

  const notifications = buildHandoffReminderNotifications(args);
  await cancelHandoffReminders();
  if (notifications.length === 0) {
    return { scheduled: 0, status: 'cancelled' as const };
  }
  if (!(await ensureNotificationPermission())) {
    return { scheduled: 0, status: 'permission-denied' as const };
  }
  await LocalNotifications.schedule({ notifications });
  return { scheduled: notifications.length, status: 'scheduled' as const };
}
