import type { DatabaseDriver } from './driver.js';

const UPSERT_NODE_REVIEW_SQL = `INSERT INTO node_review (
  node_id,
  due,
  last_review_at,
  state,
  stability,
  difficulty,
  elapsed_days,
  scheduled_days,
  reps,
  lapses
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(node_id) DO UPDATE SET
  due = excluded.due,
  last_review_at = excluded.last_review_at,
  state = excluded.state,
  stability = excluded.stability,
  difficulty = excluded.difficulty,
  elapsed_days = excluded.elapsed_days,
  scheduled_days = excluded.scheduled_days,
  reps = excluded.reps,
  lapses = excluded.lapses`;

export function createUpsertNodeReviewStatement(driver: DatabaseDriver) {
  return driver.prepare(UPSERT_NODE_REVIEW_SQL);
}
