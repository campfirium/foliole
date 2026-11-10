import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

import { isReminderForDevice, isReminderTriggerPast, type ReminderDevice, type ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import { getStoredAppLocale } from '../../../localization/appLanguage';
import { translate } from '../../../localization/translations';
import { getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';

export const COMPANION_REMINDER_NOTIFICATION_OWNER = 'foliole-reminder-v1';

type SchedulingResult = 'scheduled' | 'inactive' | 'permission-denied' | 'exact-permission-denied';

const SNOOZE_ACTION_TYPE = 'foliole-reminder-snooze';
export const REMINDER_SNOOZE_ACTIONS = { 'snooze-30': 30, 'snooze-60': 60 } as const;

let notificationWork: Promise<unknown> = Promise.resolve();

export function runCompanionReminderNotificationTask<T>(task: () => Promise<T>) {
  const next = notificationWork.then(task);
  notificationWork = next.catch(() => undefined);
  return next;
}

export function reconcileCompanionReminders(
  rules: ReminderRule[], device: ReminderDevice, requestPermission = false
) {
  return runCompanionReminderNotificationTask(() => reconcile(rules, device, requestPermission));
}

async function reconcile(
  rules: ReminderRule[], device: ReminderDevice, requestPermission = false
): Promise<SchedulingResult> {
  if (getCompanionRuntimeCapability().kind === 'browser-preview') return 'inactive';
  const exact = Capacitor.getPlatform() === 'android';
  const enabled = new Map(rules.filter(rule => rule.enabled && isReminderForDevice(rule, device)).map(rule => [rule.id, rule]));
  const localRules = [...enabled.values()].filter(rule => rule.trigger.kind !== 'foreground' && !isReminderTriggerPast(rule.trigger));
  const { notifications } = await LocalNotifications.getPending();
  const desired = new Map(localRules.map(rule => [rule.id, rule]));
  const occupied = new Set(notifications.map(notification => notification.id));
  const cancel = notifications.filter(notification => {
    if (notification.extra?.owner !== COMPANION_REMINDER_NOTIFICATION_OWNER) return false;
    if (notification.extra.snoozedFrom !== undefined) {
      return enabled.get(notification.extra.ruleId)?.revision !== notification.extra.revision;
    }
    const rule = desired.get(notification.extra.ruleId);
    if (rule && rule.revision === notification.extra.revision && (!exact || notification.extra.exact === true)) {
      desired.delete(rule.id);
      return false;
    }
    return true;
  });
  if (cancel.length) await LocalNotifications.cancel({ notifications: cancel.map(({ id }) => ({ id })) });
  const hasForeground = rules.some(rule => rule.trigger.kind === 'foreground' && rule.enabled && isReminderForDevice(rule, device));
  if (!localRules.length && !hasForeground) return 'inactive';

  let permission = await LocalNotifications.checkPermissions();
  if (requestPermission && permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return 'permission-denied';
  if (localRules.length && exact && !await allowExactReminders(requestPermission)) return 'exact-permission-denied';
  if (!desired.size) return 'scheduled';

  for (const rule of desired.values()) {
    await scheduleReminder(rule, availableId(occupied), exact);
  }
  return 'scheduled';
}

async function allowExactReminders(requestPermission: boolean) {
  const state = await LocalNotifications.checkExactNotificationSetting();
  if (state.exact_alarm === 'granted') return true;
  return requestPermission && (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted';
}

async function registerSnoozeActions() {
  const locale = getStoredAppLocale();
  await LocalNotifications.registerActionTypes({ types: [{
    id: SNOOZE_ACTION_TYPE,
    actions: [
      { id: 'snooze-30', title: translate(locale, 'settings.reminders.snooze30'), foreground: true },
      { id: 'snooze-60', title: translate(locale, 'settings.reminders.snooze60'), foreground: true }
    ]
  }] });
}

async function scheduleReminder(rule: ReminderRule, id: number, exact: boolean) {
  const trigger = rule.trigger;
  if (trigger.kind === 'foreground') return;
  if (trigger.kind === 'once') {
    return scheduleSingleOccurrence(rule, id, new Date(trigger.at), exact);
  }
  const on = { hour: Number(trigger.time.slice(0, 2)), minute: Number(trigger.time.slice(3)), second: 0 };
  return scheduleNotification(rule, id, { on }, exact);
}

export async function scheduleSingleOccurrence(
  rule: ReminderRule, id: number, at: Date, exact: boolean, snoozedFrom?: number
) {
  await registerSnoozeActions();
  return scheduleNotification(rule, id, { at, repeats: false }, exact, {
    occurrenceAt: at.getTime(), ...(snoozedFrom === undefined ? {} : { snoozedFrom })
  });
}

function scheduleNotification(
  rule: ReminderRule, id: number, schedule: NonNullable<LocalNotificationSchema['schedule']>,
  exact: boolean, occurrence?: { occurrenceAt: number; snoozedFrom?: number }
) {
  return LocalNotifications.schedule({ notifications: [{
    id, title: 'Foliole', body: rule.message, ...(occurrence ? { actionTypeId: SNOOZE_ACTION_TYPE } : {}),
    extra: { owner: COMPANION_REMINDER_NOTIFICATION_OWNER, ruleId: rule.id, revision: rule.revision, exact, ...occurrence },
    schedule: { ...schedule, allowWhileIdle: true },
    isExactNotification: exact, isExactMandatory: exact
  }] });
}

function availableId(occupied: Set<number>) {
  let id = 500_000_000;
  while (occupied.has(id)) id += 1;
  occupied.add(id);
  return id;
}
