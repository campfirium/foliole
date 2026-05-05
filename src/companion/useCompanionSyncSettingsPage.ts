import { useEffect, useState } from 'react';

import type { CompanionTabAction } from './CompanionFloatingBars';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export type CompanionSettingsPage = 'list' | 'sync' | 'syncActivity' | 'syncConnection' | 'syncHandoff';

export function useCompanionSyncSettingsPage(args: {
  activeAction: CompanionTabAction;
  syncOnboardingStatus: ReturnType<typeof useCompanionWorkspaceSync>['state']['sync_onboarding_status'];
}) {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');

  useEffect(() => {
    if (args.activeAction !== 'more') {
      setSettingsPage('list');
    }
  }, [args.activeAction]);

  useEffect(() => {
    if (args.activeAction === 'more' && args.syncOnboardingStatus === 'accepted') {
      setSettingsPage('sync');
    }
  }, [args.activeAction, args.syncOnboardingStatus]);

  return { setSettingsPage, settingsPage };
}
