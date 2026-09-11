import { useEffect, useState, useSyncExternalStore } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import {
  getCompanionSyncParticipationSnapshot,
  loadCompanionSyncParticipationState,
  subscribeCompanionSyncParticipation
} from '../shared/platform/companion/sync/syncGroupProvider';

export function useCompanionSyncParticipation() {
  const [hydrated, setHydrated] = useState(false);
  const state = useSyncExternalStore(
    subscribeCompanionSyncParticipation,
    getCompanionSyncParticipationSnapshot,
    getCompanionSyncParticipationSnapshot
  );
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;
    const refresh = () => {
      void loadCompanionSyncParticipationState()
        .then(() => { if (!cancelled) setHydrated(true); })
        .catch(() => undefined);
    };
    refresh();
    void subscribeNativeAppForeground(refresh).then((nextUnsubscribe) => {
      if (cancelled) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
      refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return { ...state, hydrated };
}

export function assertCompanionSyncParticipating(participating: boolean) {
  if (!participating) throw new Error('sync_participation_inactive');
}
