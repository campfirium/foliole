import { useEffect, useEffectEvent } from 'react';

import { startCompanionForegroundReminders } from '../shared/platform/companion/settings/companionForegroundReminders';
import { listenForCompanionReminderFlow, type ReminderSnoozeChoice } from '../shared/platform/companion/settings/companionReminderActions';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

export function useCompanionReminderNavigation(openFlow: () => void, chooseSnooze: (choice: ReminderSnoozeChoice) => void) {
  const navigate = useEffectEvent(openFlow);
  const showSnooze = useEffectEvent(chooseSnooze);
  useEffect(() => {
    if (!isNativeCompanionRuntime()) return;
    const report = (error: unknown) => logRuntimeError('Reminder navigation listener failed', {
      area: 'native', action: 'listen-reminder-navigation', error
    });
    const stopForegroundReminders = startCompanionForegroundReminders();
    const listener = listenForCompanionReminderFlow(() => navigate(), choice => showSnooze(choice));
    void listener.ready.catch(report);
    return () => {
      stopForegroundReminders();
      void listener.dispose().catch(report);
    };
  }, []);
}
