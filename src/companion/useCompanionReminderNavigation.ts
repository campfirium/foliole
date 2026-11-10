import { useEffect, useEffectEvent } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DiveFlowScope } from '../../lib/core/flow/dailyFlowSession';
import { listVisibleDives, resolveDiveMembership } from '../shared/diveMembership';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { startCompanionForegroundReminders } from '../shared/platform/companion/settings/companionForegroundReminders';
import { listenForCompanionReminderFlow } from '../shared/platform/companion/settings/companionReminderActions';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import { logRuntimeError } from '../shared/platform/runtimeLogging';
import { requestAppConfirmation } from '../shared/ui/appConfirmation';

export function useCompanionReminderNavigation(ready: boolean, snapshot: WorkspaceSnapshot | null, actions: {
  openFlow(): void;
  openDive(scope: DiveFlowScope): void;
}) {
  const t = useTranslation();
  const libraryScope = snapshot?.libraryScope;
  const navigate = useEffectEvent(() => actions.openFlow());
  const navigateDive = useEffectEvent((id: string) => {
    const dive = snapshot && listVisibleDives(snapshot).find(entry => entry.id === id);
    if (snapshot && dive) {
      actions.openDive({ id, topicIds: resolveDiveMembership(snapshot, dive).topics });
    } else {
      void requestAppConfirmation({
        title: t('settings.reminders.diveUnavailable'), confirmLabel: t('shared.close'), cancelLabel: null
      });
    }
  });
  useEffect(() => {
    if (!ready || !isNativeCompanionRuntime()) return;
    const report = (error: unknown) => logRuntimeError('Reminder navigation listener failed', {
      area: 'native', action: 'listen-reminder-navigation', error
    });
    const stopForegroundReminders = startCompanionForegroundReminders();
    const listener = listenForCompanionReminderFlow(() => navigate(), id => navigateDive(id));
    void listener.ready.catch(report);
    return () => {
      stopForegroundReminders();
      void listener.dispose().catch(report);
    };
  }, [ready, libraryScope]);
}
