import type { DbPort } from '../sync/dbPort.js';

import { INSERT_REVIEW_EVENT_SQL } from './reviewLogRecord.js';
import { recomputeNodeReviewWithDb } from './reviewProjection.js';

/** Caller owns the transaction. Reset facts use the ordinary review sync path. */
export async function resetItemReviewsWithDb(db: DbPort, context: {
  hostName: string; now: string; createId(): string;
}) {
  const items = await db.query<{ id: string }>("SELECT id FROM nodes WHERE kind = 'item' AND deleted_at IS NULL");
  const latest = await db.query<{ reviewed_at: string }>(`SELECT r.reviewed_at FROM review_log r
    JOIN nodes n ON n.id = r.node_id WHERE n.kind = 'item' AND n.deleted_at IS NULL`);
  let instant = Date.parse(context.now);
  for (const row of latest) instant = Math.max(instant, Date.parse(row.reviewed_at) + 1);
  if (!Number.isFinite(instant)) throw new Error('Invalid review timestamp.');
  const at = new Date(instant).toISOString();
  for (const item of items) {
    const id = context.createId();
    await db.run(INSERT_REVIEW_EVENT_SQL, [id, id, context.hostName, item.id, 0, '', at, 'reset', null]);
    await recomputeNodeReviewWithDb(db, item.id);
  }
  return items.map(item => item.id);
}
