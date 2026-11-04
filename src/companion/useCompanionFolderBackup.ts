import { useEffect } from 'react';

import { readNativeAppActiveState, subscribeNativeAppForeground, subscribeNativeAppEnteredBackground } from '../shared/platform/appLifecycle';
import { companionFolderSync, readCompanionFolderSyncState, supportsCompanionFolderSync } from '../shared/platform/companion/folderSync/companionFolderSync';
import { createFolderSyncCadence } from '../shared/platform/companion/folderSync/folderSyncCadence';
import { subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { subscribeCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

export function useCompanionFolderBackup(ready: boolean, libraryScope: string | undefined) {
  useEffect(() => {
    if (!ready || !supportsCompanionFolderSync()) return;
    const cadence = createFolderSyncCadence({ service: companionFolderSync,
      readState: readCompanionFolderSyncState, readActive: readNativeAppActiveState });
    let stopped = false;
    const unsubscribers = [
      subscribeCompanionHighValueMutation(() => { void cadence.refresh('mutation').catch(() => undefined); }),
      subscribeCompanionReadingScope(() => cadence.invalidate())
    ];
    const keep = async (value: Promise<() => void>) => {
      const unsubscribe = await value;
      if (stopped) unsubscribe(); else unsubscribers.push(unsubscribe);
    };
    void keep(subscribeNativeAppForeground(() => { void cadence.foreground().catch(() => undefined); })).catch(() => undefined);
    void keep(subscribeNativeAppEnteredBackground(() => cadence.background())).catch(() => undefined);
    void readNativeAppActiveState().then(active => { if (!stopped && active) return cadence.foreground(); }).catch(() => undefined);
    return () => { stopped = true; cadence.stop(); unsubscribers.forEach(unsubscribe => unsubscribe()); };
  }, [ready, libraryScope]);
}
