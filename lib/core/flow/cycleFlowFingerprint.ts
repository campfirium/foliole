import { hashTextBody } from '../database/textBodyHash.js';

import { EMPTY_CYCLE_HASH, type CycleMeta, type CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

function rowHash(row: CycleRow) {
  return row.active ? hashTextBody(JSON.stringify([row.node_id, row.order_key, row.cohort, row.initial_task, row.handled])) : EMPTY_CYCLE_HASH;
}

export function changeCycleHash(hash: string, before: CycleRow[], after: CycleRow[]) {
  const parts = [hash, ...before.map(rowHash), ...after.map(rowHash)];
  let result = '';
  for (let index = 0; index < 64; index += 2) {
    const value = parts.reduce((sum, part) => sum ^ Number.parseInt(part.slice(index, index + 2), 16), 0);
    result += value.toString(16).padStart(2, '0');
  }
  return result;
}

export function cycleStamp(meta: CycleMeta, session: DailyFlowSession) {
  return hashTextBody(JSON.stringify([meta.rowsHash, meta.clearKey, meta.clearedAt, meta.scanAfter, meta.lapLimit,
    meta.remaining, meta.reviewRemaining, session.currentNodeId, session.completedAt ?? null,
    session.continueNodeId ?? null, session.currentItemStartedAt ?? null, session.readingElapsedMs ?? 0,
    session.readTopicCount ?? 0, session.reviewElapsedMs ?? 0, session.reviewedItemCount ?? 0,
    session.sessionStartedAt ?? null, session.totalNodeCount]));
}

export function cycleMeta(state: CycleMeta): CycleMeta {
  const { clearKey, clearedAt, scanAfter, lapLimit, tailKey, rowsHash, stamp, remaining, reviewRemaining } = state;
  return { clearKey, clearedAt, scanAfter, lapLimit, tailKey, rowsHash, stamp, remaining, reviewRemaining };
}

export function allocateCycleKey(meta: CycleMeta) {
  if (!Number.isSafeInteger(meta.tailKey + 1)) throw new Error('daily_flow_order_exhausted');
  meta.tailKey += 1;
  return meta.tailKey;
}
