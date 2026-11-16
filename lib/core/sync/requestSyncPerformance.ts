/** Optional process-local measurement for an isolated sync test window. */
type Phase = 'inventory_prepare' | 'object_prepare' | 'receive_apply' | 'review_projection' | 'receive_http_inclusive';
type Outcome = 'complete' | 'partial' | 'failed' | 'cancelled';
type PhaseTotals = { started: number; finished: number; elapsedMsSum: number; spanMs: number };

export let requestSyncPerformance: ReturnType<typeof createPerformance> | undefined;

function createPerformance(clock: () => number) {
  const start = clock();
  const phases = new Map<Phase, PhaseTotals & { first: number }>();
  const seen = { pulls: new Set<string>(), reviews: new Set<string>() };
  const counts = { pullAttempts: 0, repeatedPulls: 0, preparedObjects: 0, preparedObjectBytes: 0, receivedWireBytes: 0,
    applyObjectsOffered: 0, committedObjects: 0,
    reviewProjections: 0, repeatedReviewProjections: 0 };
  let stopped = false;
  let exact = true;

  function repeated(bucket: keyof typeof seen, key: string) {
    const keys = seen[bucket];
    if (keys.has(key)) return true;
    if (keys.size < 100_000) keys.add(key);
    else exact = false;
    return false;
  }

  return {
    begin(phase: Phase) {
      const began = clock();
      const totals = phases.get(phase) ?? {
        started: 0, finished: 0, elapsedMsSum: 0, spanMs: 0, first: began
      };
      phases.set(phase, totals);
      totals.started++;
      let finished = false;
      return () => {
        if (stopped || finished) return;
        finished = true;
        const ended = clock();
        totals.finished++;
        totals.elapsedMsSum += ended - began;
        totals.spanMs = Math.max(totals.spanMs, ended - totals.first);
      };
    },
    pull(objectType: string, id: string) {
      counts.pullAttempts++;
      if (repeated('pulls', `${objectType}\0${id}`)) counts.repeatedPulls++;
    },
    review(id: string) {
      counts.reviewProjections++;
      if (repeated('reviews', id)) counts.repeatedReviewProjections++;
    },
    add(counter: keyof typeof counts, value = 1) { counts[counter] += value; },
    finish(outcome: Outcome) {
      stopped = true;
      seen.pulls.clear();
      seen.reviews.clear();
      return { outcome, elapsedMs: clock() - start, counts: { ...counts }, repeatedCountsExact: exact,
        phases: Object.fromEntries([...phases].map(([key, { started, finished, elapsedMsSum, spanMs }]) =>
          [key, { started, finished, elapsedMsSum, spanMs, unfinished: started - finished }])) };
    }
  };
}

export function startRequestSyncPerformance(clock = () => performance.now()) {
  if (requestSyncPerformance) throw new Error('sync_measurement_already_active');
  requestSyncPerformance = createPerformance(clock);
}

export function finishRequestSyncPerformance(outcome: Outcome) {
  const running = requestSyncPerformance;
  requestSyncPerformance = undefined;
  return running?.finish(outcome);
}
