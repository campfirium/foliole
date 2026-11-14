import type { DatabaseDriver } from './driver.js';
import { IMPORTED_REVIEW_OP_PREFIX } from './initialReviewSchedule.js';
import { INSERT_REVIEW_EVENT_SQL } from './reviewLogRecord.js';
import { recomputeNodeReview } from './reviewProjection.js';

export function writeImportedReviewHistory(driver: DatabaseDriver, input: {
  nodeId: string;
  host: string;
  source: string;
  events: readonly { op_id: string; grade: number; reviewed_at: string }[];
}) {
  if (!input.events.length) return;
  const insert = driver.prepare(INSERT_REVIEW_EVENT_SQL);
  for (const event of input.events) {
    const id = `${IMPORTED_REVIEW_OP_PREFIX}${input.nodeId}:${event.op_id}`;
    insert.run([id, id, input.host, input.nodeId, event.grade, input.source, event.reviewed_at, 'review', null]);
  }
  recomputeNodeReview(driver, input.nodeId);
}
