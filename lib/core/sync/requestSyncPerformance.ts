/** Optional process-local measurement for an isolated sync test window. */
type Phase = 'inventory_prepare' | 'object_prepare' | 'receive_apply' | 'review_projection' | 'receive_http_inclusive';
type Outcome = 'complete' | 'partial' | 'failed' | 'cancelled';
type PhaseTotals = { started: number; finished: number; elapsedMsSum: number; spanMs: number };
const adoptionMilestones = ['adoption_committed', 'adoption_followup_finished',
  'attachment_stage_entered', 'first_attachment_dispatched'] as const;
type AdoptionMilestone = typeof adoptionMilestones[number];
export type SyncReceiveStage = 'adoption' | 'followup';
const receiveCounts = () => ({ pullBatches: 0, nodeAttempts: 0, otherAttempts: 0,
  repeatedAttempts: 0, repeatedFromAdoption: 0, decodedTombstones: 0 });

export let requestSyncPerformance: ReturnType<typeof createPerformance> | undefined;

function countReceiveStage(section: ReturnType<typeof receiveCounts>, objectType: string,
  duplicate: boolean, fromAdoption: boolean) {
  if (objectType === 'node') section.nodeAttempts++;
  else section.otherAttempts++;
  if (duplicate) section.repeatedAttempts++;
  if (fromAdoption) section.repeatedFromAdoption++;
}

function recordTiming(clock: () => number, stopped: () => boolean) {
  const phases = new Map<Phase, PhaseTotals & { first: number }>();
  return {
    begin(phase: Phase) {
      const began = clock();
      const totals = phases.get(phase) ?? { started: 0, finished: 0, elapsedMsSum: 0, spanMs: 0, first: began };
      phases.set(phase, totals);
      totals.started++;
      let finished = false;
      return () => {
        if (stopped() || finished) return;
        finished = true;
        const ended = clock();
        totals.finished++;
        totals.elapsedMsSum += ended - began;
        totals.spanMs = Math.max(totals.spanMs, ended - totals.first);
      };
    },
    summary: () => Object.fromEntries([...phases].map(([key, { started, finished, elapsedMsSum, spanMs }]) =>
      [key, { started, finished, elapsedMsSum, spanMs, unfinished: started - finished }]))
  };
}

function createPerformance(clock: () => number) {
  const start = clock();
  const milestonesMs: Partial<Record<AdoptionMilestone, number>> = {};
  const seen = { pulls: new Set<string>(), reviews: new Set<string>(), adoption: new Set<string>() };
  const receive = { adoption: receiveCounts(), followup: receiveCounts() };
  const counts = { pullAttempts: 0, repeatedPulls: 0, preparedObjects: 0, preparedObjectBytes: 0, receivedWireBytes: 0,
    applyObjectsOffered: 0, committedObjects: 0,
    reviewProjections: 0, repeatedReviewProjections: 0 };
  let stopped = false;
  let exact = true;
  const timing = recordTiming(clock, () => stopped);

  function repeated(bucket: keyof typeof seen, key: string) {
    const keys = seen[bucket];
    if (keys.has(key)) return true;
    if (keys.size < 100_000) keys.add(key);
    else exact = false;
    return false;
  }

  return {
    markAdoption(milestone: AdoptionMilestone) {
      const previous = adoptionMilestones[adoptionMilestones.indexOf(milestone) - 1];
      if (!stopped && milestonesMs[milestone] === undefined &&
        (!previous || milestonesMs[previous] !== undefined)) milestonesMs[milestone] = clock() - start;
    },
    begin: timing.begin,
    pullBatch(stage: SyncReceiveStage) { receive[stage].pullBatches++; },
    decodedTombstone(stage: SyncReceiveStage) { receive[stage].decodedTombstones++; },
    pull(objectType: string, id: string, stage?: SyncReceiveStage) {
      const key = `${objectType}\0${id}`;
      const duplicate = repeated('pulls', key);
      counts.pullAttempts++;
      if (duplicate) counts.repeatedPulls++;
      if (!stage) return;
      countReceiveStage(receive[stage], objectType, duplicate, stage === 'followup' && seen.adoption.has(key));
      if (stage === 'adoption') repeated('adoption', key);
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
      seen.adoption.clear();
      return { outcome, elapsedMs: clock() - start, counts: { ...counts }, repeatedCountsExact: exact,
        milestonesMs: { ...milestonesMs }, receiveStages: { adoption: { ...receive.adoption }, followup: { ...receive.followup } },
        phases: timing.summary() };
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
