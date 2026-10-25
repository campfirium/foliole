import type { ReviewEvent } from '../review/recomputeReview.js';
import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

/** Keep the existing outbound state truthful until its separate retirement. */
function projectionState(nodeId: string, card: SchedulerCard | null, events: readonly (ReviewEvent & { host_name: string })[]) {
  const latest = [...events].sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at)
    || (a.op_id < b.op_id ? 1 : a.op_id > b.op_id ? -1 : 0))[0];
  if (!latest) return null;
  const updatedAt = new Date(latest.reviewed_at).toISOString();
  const payload = card ? { node_id: nodeId, due: card.due, last_review_at: card.last_review,
    state: card.state, stability: card.stability, difficulty: card.difficulty, elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days, reps: card.reps, lapses: card.lapses }
    : { node_id: nodeId, deleted_at: updatedAt, object_type: 'node_review' };
  return { objectType: 'node_review' as const, objectId: nodeId, contentHash: computeSyncContentHash('node_review', payload),
    lastModifiedByHostName: latest.host_name, updatedAt, deletedAt: card ? null : updatedAt, syncDirty: true };
}

export function recordReviewProjection(driver: DatabaseDriver, ...args: Parameters<typeof projectionState>) {
  const state = projectionState(...args);
  if (state) upsertSyncObjectState(driver, state);
}

export async function recordReviewProjectionWithDb(db: DbPort, ...args: Parameters<typeof projectionState>) {
  const state = projectionState(...args);
  if (!state) return;
  await db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('node_review', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
    content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`,
  [state.objectId, state.contentHash, state.lastModifiedByHostName, state.updatedAt, state.deletedAt]);
}
