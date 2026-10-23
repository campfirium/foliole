import { useSyncExternalStore } from 'react';

import {
  readCompanionSyncGroupAdoptionRun,
  subscribeCompanionSyncGroupAdoptionRun
} from '../shared/platform/companion/sync/companionSyncGroupAdoptionRun';

export function useCompanionSyncGroupAdoptionRun() {
  return useSyncExternalStore(subscribeCompanionSyncGroupAdoptionRun, readCompanionSyncGroupAdoptionRun);
}
