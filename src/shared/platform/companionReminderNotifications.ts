import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice, type ReminderDevice, type ReminderRule } from '../../../lib/core/reminders/reminderRule';

const owner = 'foliole-reminder-v1';

type SchedulingResult = 'scheduled' | 'inactive' | 'permission-denied';

export async function reconcileCompanionReminders(
  rules: ReminderRule[], device: ReminderDevice, requestPermission = false
): Promise<SchedulingResult> {
  const localRules = rules.filter(rule => rule.enabled && isReminderForDevice(rule, device));
  const { notifications } = await LocalNotifications.getPending();
  const desired = new Map(localRules.map(rule => [rule.id, rule]));
  const occupied = new Set(notifications.map(notification => notification.id));
  const cancel = notifications.filter(notification => {
    if (notification.extra?.owner !== owner) return false;
    const rule = desired.get(notification.extra.ruleId);
    if (rule && rule.revision === notification.extra.revision) {
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
  if (!desired.size) return 'scheduled';

  for (const rule of desired.values()) {
    await scheduleDailyReminder(rule, availableId(occupied));
  }
  return 'scheduled';
}

function scheduleDailyReminder(rule: ReminderRule, id: number) {
  const hour = Number(rule.trigger.time.slice(0, 2));
  const minute = Number(rule.trigger.time.slice(3));
  return LocalNotifications.schedule({ notifications: [{
    id, title: 'Foliole', body: rule.message,
    extra: { owner, ruleId: rule.id, revision: rule.revision },
    schedule: { on: { hour, minute, second: 0 }, allowWhileIdle: true },
    isExactNotification: false
  }] });
}

function availableId(occupied: Set<number>) {
  let id = 500_000_000;
  while (occupied.has(id)) id += 1;
  occupied.add(id);
  return id;
}
