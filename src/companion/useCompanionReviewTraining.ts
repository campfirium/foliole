import { useEffect, useRef, useSyncExternalStore } from 'react';

import { startReviewTrainingIdle } from '../features/review/model/reviewTrainingIdle';
import { setReviewTrainingStudyActive } from '../features/review/model/reviewTrainingSession';
import { readNativeAppActiveState, subscribeNativeAppBackground, subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { subscribeCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';
import { subscribeCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

export function useCompanionReviewTraining(enabled: boolean, studyActive: boolean, snapshot: unknown) {
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  const trainingRef = useRef<ReturnType<typeof startReviewTrainingIdle> | null>(null);
  useEffect(() => {
    setReviewTrainingStudyActive(studyActive);
    return () => setReviewTrainingStudyActive(false);
  }, [studyActive]);
  useEffect(() => {
    if (!enabled) return;
    let active = false;
    let disposed = false;
    let revision = 0;
    const training = startReviewTrainingIdle(() => active);
    trainingRef.current = training;
    const unlisteners = [subscribeCompanionSyncApplied(training.wake), subscribeCompanionSyncMutationRevision(training.wake)];
    const report = (error: unknown) => logRuntimeError('Review training lifecycle failed', { area: 'native', action: 'review-training-lifecycle', error });
    const setActive = (value: boolean) => {
      if (disposed) return;
      revision += 1; active = value; training.resetIdle();
    };
    const initialRevision = revision;
    const subscriptions = [subscribeNativeAppForeground(() => setActive(true)), subscribeNativeAppBackground(() => setActive(false))];
    for (const subscription of subscriptions) void subscription.then(unlisten => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    }).catch(report);
    void readNativeAppActiveState().then(value => {
      if (revision === initialRevision) setActive(value);
    }).catch(report);
    return () => {
      disposed = true; active = false; training.dispose();
      if (trainingRef.current === training) trainingRef.current = null;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [enabled, scope]);
  useEffect(() => { trainingRef.current?.wake(); }, [snapshot]);
}
