import { useEffect, useEffectEvent } from 'react';

import { startCompanionForegroundReminders } from '../shared/platform/companion/settings/companionForegroundReminders';
import { listenForCompanionReminderFlow } from '../shared/platform/companion/settings/companionReminderActions';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

export function useCompanionReminderNavigation(ready: boolean, libraryScope: string | undefined, openFlow: () => void) {
  const navigate = useEffectEvent(openFlow);
  useEffect(() => {
    if (!ready || !isNativeCompanionRuntime()) return;
    const report = (error: unknown) => logRuntimeError('Reminder navigation listener failed', {
      area: 'native', action: 'listen-reminder-navigation', error
    });
    const stopForegroundReminders = startCompanionForegroundReminders();
    const listener = listenForCompanionReminderFlow(() => navigate());
    void listener.ready.catch(report);
    return () => {
      stopForegroundReminders();
      void listener.dispose().catch(report);
    };
  }, [ready, libraryScope]);
}
