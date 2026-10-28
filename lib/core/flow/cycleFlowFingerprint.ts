import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { hashTextBody } from '../database/textBodyHash.js';

import type { CycleMeta, CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

const rowEncoder = new TextEncoder();

export function changeCycleHash(hash: string, before: CycleRow[], after: CycleRow[]) {
  const result = Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16));
  for (const rows of [before, after]) {
    for (const row of rows) {
      if (!row.active) continue;
      const digest = sha256(rowEncoder.encode(JSON.stringify([
        row.node_id, row.order_key, row.cohort, row.initial_task, row.handled
      ])));
      for (let index = 0; index < result.length; index++) result[index] = result[index]! ^ digest[index]!;
    }
  }
  return bytesToHex(result);
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
