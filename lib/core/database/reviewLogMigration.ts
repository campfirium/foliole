import type { DbPort } from '../sync/dbPort.js';

import { INVALIDATE_ALL_SYNC_DIGESTS } from './framedSyncDigestSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists } from './numberedMigrationHelpers.js';
import { migrateCompanionReviewHistoryReferences } from './reviewHistoryReferencesMigration.js';

const STATE_COLUMNS = ['due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'] as const;

// This is the approved legacy repair policy, not a claim about the historical UI action.
const BYPASSED = `WITH ordered AS (
  SELECT *, LEAD(due_before) OVER w AS next_due,
    LEAD(stability_before) OVER w AS next_stability,
    LEAD(difficulty_before) OVER w AS next_difficulty,
    LEAD(reviewed_at) OVER w AS next_time
  FROM review_log WHERE kind = 'review'
  WINDOW w AS (PARTITION BY node_id ORDER BY reviewed_at, op_id)
) SELECT * FROM ordered WHERE next_time IS NOT NULL AND (
  (due_before = next_due AND stability_before = next_stability AND difficulty_before = next_difficulty)
  OR (stability_before = 0 AND difficulty_before = 0 AND next_stability = 0 AND next_difficulty = 0
    AND due_before = reviewed_at AND next_due = next_time))`;

function insertRepair(kind: 'void' | 'reset', select: string) {
  const identity = kind === 'void' ? "'review-migration:void:' || op_id" : "'review-migration:reset:' || node_id";
  return `INSERT OR IGNORE INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id,
      ${STATE_COLUMNS.join(', ')})
    SELECT ${identity}, ${identity}, 'review-history-migration', node_id, 0, '',
      ${kind === 'void' ? 'next_time' : 'reviewed_at'}, '${kind}', ${kind === 'void' ? 'op_id' : 'NULL'},
      ${STATE_COLUMNS.join(', ')} FROM (${select})`;
}

const REPAIR_STATEMENTS = [
  "ALTER TABLE review_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'review' CHECK(kind IN ('review', 'reset', 'void'))",
  'ALTER TABLE review_log ADD COLUMN voids_op_id TEXT',
  insertRepair('void', BYPASSED),
  insertRepair('reset', `SELECT r.* FROM review_log r WHERE r.kind = 'review'
    AND NOT EXISTS (SELECT 1 FROM node_review s WHERE s.node_id = r.node_id)
    AND r.op_id = (SELECT l.op_id FROM review_log l WHERE l.node_id = r.node_id AND l.kind = 'review'
      ORDER BY l.reviewed_at DESC, l.op_id DESC LIMIT 1)`),
  ...STATE_COLUMNS.map(column => `ALTER TABLE review_log DROP COLUMN ${column}`),
  INVALIDATE_ALL_SYNC_DIGESTS
];

export function migrateReviewLog(db: DatabaseMigrationTarget) {
  if (!columnExists(db, 'review_log', 'due_before')) return;
  for (const sql of REPAIR_STATEMENTS) db.exec(sql);
}

export async function migrateCompanionReviewLog(db: DbPort) {
  const columns = await db.query<{ name: string }>('PRAGMA table_info(review_log)');
  if (!columns.some(column => column.name === 'due_before')) return;
  await migrateCompanionReviewHistoryReferences(db);
  for (const sql of REPAIR_STATEMENTS) await db.run(sql);
}
