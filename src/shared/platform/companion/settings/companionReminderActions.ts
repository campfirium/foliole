import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice } from '../../../../../lib/core/reminders/reminderRule';
import { logRuntimeError } from '../../runtimeLogging';

import {
  COMPANION_REMINDER_NOTIFICATION_OWNER, REMINDER_SNOOZE_ACTIONS, runCompanionReminderNotificationTask
} from './companionReminderNotifications';
import { loadCompanionReminderDevice, loadCompanionReminderRules } from './companionReminderRepository';
import { snoozeCompanionReminder } from './companionReminderSnooze';

export function listenForCompanionReminderFlow(onOpenFlow: () => void) {
  let active = true;
  const subscription = LocalNotifications.addListener('localNotificationActionPerformed', async event => {
    const extra = event.notification?.extra;
    const actionAt = Date.now();
    const minutes = event.actionId === 'snooze-30' || event.actionId === 'snooze-60'
      ? REMINDER_SNOOZE_ACTIONS[event.actionId] : undefined;
    if (!active || extra?.owner !== COMPANION_REMINDER_NOTIFICATION_OWNER || (!minutes && event.actionId !== 'tap')) return;
    try {
      await runCompanionReminderNotificationTask(async () => {
        const [rules, device] = await Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]);
        const rule = rules.find(candidate => candidate.id === extra.ruleId && candidate.revision === extra.revision);
        if (!active || !rule?.enabled || !isReminderForDevice(rule, device)) return;
        if (minutes) await snoozeCompanionReminder(rule, event.notification, minutes, actionAt);
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
