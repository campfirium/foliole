import { useEffect, useSyncExternalStore } from 'react';

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
    void loadCompanionSyncParticipationState().catch(() => undefined);
  }, []);
  return state;
}

export function assertCompanionSyncParticipating(participating: boolean) {
  if (!participating) throw new Error('sync_participation_inactive');
}
