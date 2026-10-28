import type { CycleMeta } from './cycleFlowTypes.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

export function cycleMeta(state: CycleMeta): CycleMeta {
  const { clearKey, clearedAt, scanAfter, lapLimit, tailKey, remaining, reviewRemaining } = state;
  return { clearKey, clearedAt, scanAfter, lapLimit, tailKey, remaining, reviewRemaining };
}

function progress(session: DailyFlowSession) {
  const meta = session.cycle!;
  return [meta.clearKey, meta.clearedAt, meta.scanAfter, meta.lapLimit, meta.remaining, meta.reviewRemaining,
    session.currentNodeId, session.completedAt ?? null, session.continueNodeId ?? null,
    session.currentItemStartedAt ?? null, session.readingElapsedMs ?? 0, session.readTopicCount ?? 0,
    session.reviewElapsedMs ?? 0, session.reviewedItemCount ?? 0, session.sessionStartedAt ?? null,
    session.totalNodeCount];
}

// Compare the saved cursor and counters directly; list rows are not summarized or scanned.
export function sameCycleProgress(left: DailyFlowSession, right: DailyFlowSession) {
  if (!left.cycle || !right.cycle) return false;
  const expected = progress(right);
  return progress(left).every((value, index) => value === expected[index]);
}

export function allocateCycleKey(meta: CycleMeta) {
  if (!Number.isSafeInteger(meta.tailKey + 1)) throw new Error('daily_flow_order_exhausted');
  meta.tailKey += 1;
  return meta.tailKey;
}
