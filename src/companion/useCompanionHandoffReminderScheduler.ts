import { useEffect } from 'react';

import { scheduleCompanionHandoffReminders } from '../shared/platform/companionHandoffNotifications';
import { loadCompanionDirtyNodes } from '../shared/platform/companionWorkspaceSync';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useCompanionHandoffReminderScheduler(args: {
  settings: CompanionHandoffReminderSettings;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  useEffect(() => {
    let cancelled = false;

    if (args.workspaceSync.status === 'syncing') {
      return;
    }

    void loadCompanionDirtyNodes()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        return scheduleCompanionHandoffReminders({
          dirtyCount: payload.nodes.length,
          settings: args.settings
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [args.settings, args.workspaceSync.state, args.workspaceSync.status]);
}
