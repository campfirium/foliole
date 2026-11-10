import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

import type { ReminderRule } from '../../../../../lib/core/reminders/reminderRule';

import { COMPANION_REMINDER_NOTIFICATION_OWNER, scheduleSingleOccurrence } from './companionReminderNotifications';

export async function snoozeCompanionReminder(
  rule: ReminderRule, notification: LocalNotificationSchema, minutes: number, actionAt: number
) {
  const occurrence = notification.extra?.occurrenceAt;
  if (rule.trigger.kind !== 'once' || typeof occurrence !== 'number' || !Number.isFinite(occurrence)
    || occurrence > actionAt) return;

  // A local receipt survives app restart and is scoped to the current rule revision.
  const key = 'foliole-companion-reminder-snooze-' + rule.id;
  const receipt = window.localStorage.getItem(key);
  const prefix = rule.revision + ':';
  if (receipt?.startsWith(prefix) && Number(receipt.slice(prefix.length)) >= occurrence) return;
  const { notifications } = await LocalNotifications.getPending();
  const alreadyScheduled = notifications.some(item => item.extra?.owner === COMPANION_REMINDER_NOTIFICATION_OWNER
    && item.extra.ruleId === rule.id && item.extra.revision === rule.revision && item.extra.snoozedFrom === occurrence);
  if (!alreadyScheduled) {
    const exact = Capacitor.getPlatform() === 'android';
    const occupied = new Set(notifications.map(item => item.id));
    occupied.add(notification.id);
    let id: number;
    do {
      id = 520_000_000 + Math.floor(Math.random() * 100_000_000);
    } while (occupied.has(id));
    await scheduleSingleOccurrence(rule, id, new Date(actionAt + minutes * 60_000), exact, occurrence);
  }
  window.localStorage.setItem(key, prefix + occurrence);
}
