import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice, isReminderTriggerPast, type ReminderDevice, type ReminderRule } from '../../../../../lib/core/reminders/reminderRule';

const owner = 'foliole-reminder-v1';

type SchedulingResult = 'scheduled' | 'inactive' | 'permission-denied' | 'exact-permission-denied';

export async function reconcileCompanionReminders(
  rules: ReminderRule[], device: ReminderDevice, requestPermission = false
): Promise<SchedulingResult> {
  const exact = Capacitor.getPlatform() === 'android';
  const localRules = rules.filter(rule => rule.enabled && isReminderForDevice(rule, device) && !isReminderTriggerPast(rule.trigger));
  const { notifications } = await LocalNotifications.getPending();
  const desired = new Map(localRules.map(rule => [rule.id, rule]));
  const occupied = new Set(notifications.map(notification => notification.id));
  const cancel = notifications.filter(notification => {
    if (notification.extra?.owner !== owner) return false;
    const rule = desired.get(notification.extra.ruleId);
    if (rule && rule.revision === notification.extra.revision && (!exact || notification.extra.exact === true)) {
      desired.delete(rule.id);
      return false;
    }
    return true;
  });
  if (cancel.length) await LocalNotifications.cancel({ notifications: cancel.map(({ id }) => ({ id })) });
  if (!localRules.length) return 'inactive';

  let permission = await LocalNotifications.checkPermissions();
  if (requestPermission && permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return 'permission-denied';
  if (exact && !await allowExactReminders(requestPermission)) return 'exact-permission-denied';
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

function scheduleReminder(rule: ReminderRule, id: number, exact: boolean) {
  const trigger = rule.trigger;
  const schedule = trigger.kind === 'once'
    ? { at: new Date(trigger.at), repeats: false }
    : { on: { hour: Number(trigger.time.slice(0, 2)), minute: Number(trigger.time.slice(3)), second: 0 } };
  return LocalNotifications.schedule({ notifications: [{
    id, title: 'Foliole', body: rule.message,
    extra: { owner, ruleId: rule.id, revision: rule.revision, exact },
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
