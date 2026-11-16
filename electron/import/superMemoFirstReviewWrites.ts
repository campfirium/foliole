import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { IMPORTED_REVIEW_OP_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { recomputeNodeReview } from '../../lib/core/database/reviewProjection.js';

const ELIGIBLE = `SELECT 1 FROM nodes n JOIN node_review r ON r.node_id = n.id
  WHERE n.id = ? AND n.kind = 'item' AND n.deleted_at IS NULL AND n.initial_review_due = ? AND r.due = ?
  AND NOT EXISTS (SELECT 1 FROM node_reading s WHERE s.node_id = n.id AND s.state = 'dismissed')
  AND NOT EXISTS (SELECT 1 FROM review_log l WHERE l.node_id = n.id AND
    (l.kind <> 'review' OR substr(l.op_id, 1, ?) <> ?))`;

export function canUpdateSuperMemoFirstReview(driver: DatabaseDriver, nodeId: string, due: string) {
  return Boolean(driver.queryOne(ELIGIBLE, [nodeId, due, due, IMPORTED_REVIEW_OP_PREFIX.length, IMPORTED_REVIEW_OP_PREFIX]));
}

export function writeSuperMemoFirstReview(driver: DatabaseDriver, nodeId: string, due: string, now: string) {
  driver.execute('UPDATE nodes SET initial_review_due = ?, sync_dirty = 1, updated_at = ? WHERE id = ?', [due, now, nodeId]);
  recomputeNodeReview(driver, nodeId);
}
