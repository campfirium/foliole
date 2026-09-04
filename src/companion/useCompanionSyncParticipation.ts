import { useEffect, useSyncExternalStore } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import {
  getCompanionSyncParticipationSnapshot,
  loadCompanionSyncParticipationState,
  subscribeCompanionSyncParticipation
} from '../shared/platform/companion/sync/syncGroupProvider';

export function useCompanionSyncParticipation() {
  const state = useSyncExternalStore(
    subscribeCompanionSyncParticipation,
    getCompanionSyncParticipationSnapshot,
    getCompanionSyncParticipationSnapshot
  );
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;
    const refresh = () => {
      void loadCompanionSyncParticipationState().catch(() => undefined);
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
  return state;
}

export function assertCompanionSyncParticipating(participating: boolean) {
  if (!participating) throw new Error('sync_participation_inactive');
}
