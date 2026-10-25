import type { ReviewHistoryMutation } from '../review/reviewEventIdentity.js';
import type { DbPort } from '../sync/dbPort.js';
import { identityReviewRowSchema, REVIEW_FACT_COLUMNS } from '../sync/syncFactRowSchemas.js';

import type { DatabaseDriver } from './driver.js';

export const INSERT_REVIEW_EVENT_SQL = `INSERT INTO review_log
  (${REVIEW_FACT_COLUMNS.join(', ')}) VALUES (${REVIEW_FACT_COLUMNS.map(() => '?').join(', ')})`;

// Reset events preserve earlier genuine reviews in calendar/training history.
export const EFFECTIVE_REVIEW_PREDICATE = `r.kind = 'review' AND r.grade BETWEEN 1 AND 4
  AND NOT EXISTS (SELECT 1 FROM review_log v
    WHERE v.kind = 'void' AND v.node_id = r.node_id AND v.voids_op_id = r.op_id)`;

const HISTORY_REVIEW_SQL = `SELECT r.* FROM review_log r
  WHERE r.node_id = ? AND r.op_id = ? AND r.kind = 'review'`;

function historyEvent(rows: unknown[], input: {
  nodeId: string; history: ReviewHistoryMutation; hostName: string; opId: string; updatedAt: string;
}) {
  const reviews = rows.map(row => identityReviewRowSchema.parse(row));
  const target = reviews[0];
  if (!target) throw new Error('review_history_record_missing');
  return input.history.mode === 'undo'
    ? [input.opId, input.opId, input.hostName, input.nodeId, 0, '', input.updatedAt, 'void', target.op_id]
    : [input.opId, input.opId, input.hostName, input.nodeId, target.grade,
      target.scheduler_version, input.updatedAt, 'review', null];
}

export function recordReviewHistory(driver: DatabaseDriver, input: Parameters<typeof historyEvent>[1]) {
  const params = historyEvent(driver.queryAll(HISTORY_REVIEW_SQL,
    [input.nodeId, input.history.targetOpId]), input);
  driver.prepare(`${INSERT_REVIEW_EVENT_SQL} ON CONFLICT(op_id) DO NOTHING`).run(params);
}

export async function recordReviewHistoryWithDb(db: DbPort, input: Parameters<typeof historyEvent>[1]) {
  const params = historyEvent(await db.query(HISTORY_REVIEW_SQL,
    [input.nodeId, input.history.targetOpId]), input);
  await db.run(`${INSERT_REVIEW_EVENT_SQL} ON CONFLICT(op_id) DO NOTHING`, params);
}
