import { useEffect } from 'react';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useCompanionNavigationField } from './CompanionNavigationProvider';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export type CompanionSettingsPage =
  | 'foregroundTime'
  | 'list'
  | 'sync'
  | 'device'
  | 'storage'
  | 'appearance'
  | 'debug'
  | 'tabs'
  | 'syncGroup'
  | 'syncActivity'
  | 'syncConnection';

export function useCompanionSyncSettingsPage(args: {
  activeAction: CompanionTabAction;
  syncOnboardingStatus: ReturnType<typeof useCompanionWorkspaceSync>['state']['sync_onboarding_status'];
}) {
  const [settingsPage, setSettingsPage] = useCompanionNavigationField('settingsPage', 'list');

  useEffect(() => {
    if (args.activeAction !== 'more') {
      setSettingsPage('list');
    }
  }, [args.activeAction]);

  useEffect(() => {
    if (args.activeAction === 'more' && args.syncOnboardingStatus === 'accepted' && settingsPage === 'list') {
      setSettingsPage('sync');
    }
  }, [args.activeAction, args.syncOnboardingStatus]);

  return { setSettingsPage, settingsPage };
}
