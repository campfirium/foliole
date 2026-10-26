import { getReviewTrainingSession, optimizeReadyReviewFolders, subscribeReviewTrainingSession } from './reviewTrainingSession';

export const REVIEW_TRAINING_IDLE_MS = 30_000;

/** One check per idle opportunity; data changes wake it without a database polling loop. */
export function startReviewTrainingIdle() {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = true;
  let idle = false;
  let previous = getReviewTrainingSession();
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const canStart = () => !abort.signal.aborted && idle && document.visibilityState !== 'hidden';
  const schedule = () => {
    clear();
    const session = getReviewTrainingSession();
    if (abort.signal.aborted || !pending || session.studyActive || session.running || document.visibilityState === 'hidden') return;
    timer = setTimeout(() => {
      timer = undefined;
      idle = true;
      pending = false;
      void optimizeReadyReviewFolders(canStart, abort.signal).catch(() => undefined);
    }, REVIEW_TRAINING_IDLE_MS);
  };
  const wake = () => { pending = true; schedule(); };
  const activity = () => { idle = false; wake(); };
  const unsubscribe = subscribeReviewTrainingSession(() => {
    const current = getReviewTrainingSession();
    const changed = current.studyActive !== previous.studyActive || current.running !== previous.running;
    if (current.studyActive !== previous.studyActive) { idle = false; pending = true; }
    previous = current;
    if (changed) schedule();
  });
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
  for (const event of events) window.addEventListener(event, activity, { passive: true });
  document.addEventListener('visibilitychange', activity);
  schedule();
  return {
    wake,
    dispose: () => {
      abort.abort(); clear(); unsubscribe();
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener('visibilitychange', activity);
    }
  };
}
