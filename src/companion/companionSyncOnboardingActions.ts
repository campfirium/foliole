import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

import type { TopBarAction } from './CompanionFloatingBars';

export function useCompanionSyncOnboardingActions(args: {
  saveSyncOnboardingStatus(status: NativeCompanionWorkspaceSyncState['sync_onboarding_status']): Promise<unknown>;
  setActiveAction: (action: TopBarAction) => void;
}) {
  async function handleDismissSyncOnboarding() {
    await args.saveSyncOnboardingStatus('dismissed');
  }

  async function handleStartSyncOnboarding() {
    await args.saveSyncOnboardingStatus('accepted');
    args.setActiveAction('more');
  }

  return { handleDismissSyncOnboarding, handleStartSyncOnboarding };
}
