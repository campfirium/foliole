import { useEffect, useState, useSyncExternalStore } from 'react';

import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionReviewTrainingStatus } from '../shared/platform/companion/runtime/companionReviewTraining';
import { subscribeCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';
import { subscribeCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

type History = Awaited<ReturnType<typeof loadCompanionReviewTrainingStatus>>;
type Status = { scope: object; phase: 'loading' | 'ready' | 'failed'; history: History | null };

export function useCompanionReviewTrainingStatus() {
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ scope, phase: 'loading', history: null });
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      setStatus({ scope, phase: 'loading', history: null });
      void loadCompanionReviewTrainingStatus().then(history => {
        if (!disposed && current === revision && scope === getCompanionReadingScope()) {
          setStatus({ scope, phase: 'ready', history });
        }
      }).catch(() => {
        if (!disposed && current === revision && scope === getCompanionReadingScope()) {
          setStatus({ scope, phase: 'failed', history: null });
        }
      });
    };
    const unsubscribers = [subscribeCompanionSyncApplied(refresh), subscribeCompanionSyncMutationRevision(refresh)];
    refresh();
    return () => { disposed = true; for (const unsubscribe of unsubscribers) unsubscribe(); };
  }, [scope, attempt]);
  return { ...(status.scope === scope ? status : { phase: 'loading' as const, history: null }),
    retry: () => setAttempt(value => value + 1) };
}
