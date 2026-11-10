import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice } from '../../../../../lib/core/reminders/reminderRule';

import { COMPANION_REMINDER_NOTIFICATION_OWNER } from './companionReminderNotifications';
import { loadCompanionReminderDevice, loadCompanionReminderRules } from './companionReminderRepository';

export function listenForCompanionReminderFlow(onOpenFlow: () => void) {
  let active = true;
  const subscription = LocalNotifications.addListener('localNotificationActionPerformed', async event => {
    const extra = event.notification?.extra;
    if (!active || event.actionId !== 'tap' || extra?.owner !== COMPANION_REMINDER_NOTIFICATION_OWNER) return;
    try {
      const [rules, device] = await Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]);
      const rule = rules.find(candidate => candidate.id === extra.ruleId && candidate.revision === extra.revision);
      if (active && rule?.enabled && rule.destination === 'flow' && isReminderForDevice(rule, device)) onOpenFlow();
    } catch {
      // The notification can outlive the library that created it.
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
