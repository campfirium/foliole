import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

import { isReminderForDevice } from '../../../../../lib/core/reminders/reminderRule';
import { logRuntimeError } from '../../runtimeLogging';

import {
  COMPANION_REMINDER_NOTIFICATION_OWNER, REMINDER_CHOOSE_SNOOZE_ACTION, REMINDER_SNOOZE_ACTIONS,
  runCompanionReminderNotificationTask
} from './companionReminderNotifications';
import { loadCompanionReminderDevice, loadCompanionReminderRules } from './companionReminderRepository';
import { snoozeCompanionReminder } from './companionReminderSnooze';

export type ReminderSnoozeChoice = {
  message: string;
  snooze: (minutes: 30 | 60) => Promise<void>;
};

async function loadActionRule(notification: LocalNotificationSchema) {
  const extra = notification.extra;
  const [rules, device] = await Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]);
  return rules.find(rule => rule.id === extra?.ruleId && rule.revision === extra?.revision
    && rule.enabled && isReminderForDevice(rule, device));
}

export function listenForCompanionReminderFlow(
  onOpenFlow: () => void, onChooseSnooze?: (choice: ReminderSnoozeChoice) => void
) {
  let active = true;
  const subscription = LocalNotifications.addListener('localNotificationActionPerformed', async event => {
    const extra = event.notification?.extra;
    const actionAt = Date.now();
    const minutes = event.actionId === 'snooze-30' || event.actionId === 'snooze-60'
      ? REMINDER_SNOOZE_ACTIONS[event.actionId] : undefined;
    const choose = event.actionId === REMINDER_CHOOSE_SNOOZE_ACTION;
    if (!active || extra?.owner !== COMPANION_REMINDER_NOTIFICATION_OWNER
      || (!minutes && !choose && event.actionId !== 'tap')) return;
    function snooze(duration: 30 | 60) {
      const selectedAt = Date.now();
      return runCompanionReminderNotificationTask(async () => {
        const rule = await loadActionRule(event.notification);
        if (active && rule) await snoozeCompanionReminder(rule, event.notification, duration, selectedAt);
      });
    }

    try {
      await runCompanionReminderNotificationTask(async () => {
        const rule = await loadActionRule(event.notification);
        if (!active || !rule) return;
        if (choose) {
          if (rule.trigger.kind === 'once' && typeof extra.occurrenceAt === 'number' && extra.occurrenceAt <= actionAt) {
            onChooseSnooze?.({ message: rule.message, snooze });
          }
        } else if (minutes) await snoozeCompanionReminder(rule, event.notification, minutes, actionAt);
        else if (rule.destination === 'flow') onOpenFlow();
      });
    } catch (error) {
      logRuntimeError('Reminder notification action failed', { area: 'native', action: event.actionId, error });
    }
  });
  return {
    ready: subscription.then(() => undefined),
    dispose() {
      active = false;
      return subscription.then(handle => handle.remove());
    }
  };
}
