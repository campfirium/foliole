import { z } from 'zod';

import { recomputeReview } from '../review/recomputeReview.js';
import { createInitialSchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';
import { identityReviewRowSchema, REVIEW_FACT_COLUMNS } from '../sync/syncFactRowSchemas.js';

import { DAILY_FLOW_LEARNING_TRIGGERS } from './dailyFlowSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { UPSERT_NODE_REVIEW_SQL } from './nodeReviewMutationStatements.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import { parametersForNode } from './reviewProjection.js';

const CARDS = 'SELECT node_id, due FROM node_review ORDER BY node_id';
const EVENTS = `SELECT ${REVIEW_FACT_COLUMNS.join(', ')} FROM review_log WHERE node_id = ?`;
const SETTINGS = `SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'
  AND scope = 'user_space' ORDER BY updated_at DESC, content_hash DESC LIMIT 1`;
const ANCESTORS = `WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, desired_retention, enable_short_term FROM nodes WHERE id = ?
  UNION SELECT n.id, n.parent_id, n.desired_retention, n.enable_short_term FROM nodes n JOIN ancestors a ON n.id = a.parent_id
) SELECT * FROM ancestors`;
const previousCard = z.object({ node_id: z.string(), due: z.string() });

function rebuild(row: unknown, events: unknown[], settings: unknown[], ancestors: unknown[]) {
  const { node_id: id, due } = previousCard.parse(row);
  const card = recomputeReview(events.map(value => identityReviewRowSchema.parse(value)),
    parametersForNode(id, settings, ancestors), id) ?? createInitialSchedulerCard(due);
  // Preserve only the upgrade-time arrangement. Subsequent facts use ordinary FSRS-7 projection.
  return [id, due, card.last_review, card.state, card.stability, card.stability_fast ?? 0,
    card.difficulty, card.elapsed_days, card.scheduled_days, card.reps, card.lapses];
}

/** The existing schema-upgrade transaction owns this one-time conversion and rollback. */
export function migrateFsrs7(db: DatabaseMigrationTarget) {
  addColumnIfMissing(db, 'node_review', 'stability_fast', 'REAL NOT NULL DEFAULT 0');
  db.exec('DROP TRIGGER IF EXISTS daily_flow_node_review_update');
  for (const sql of DAILY_FLOW_LEARNING_TRIGGERS) db.exec(sql);
  const settings = db.prepare(SETTINGS).all();
  for (const row of db.prepare(CARDS).all()) {
    const { node_id: id } = previousCard.parse(row);
    db.prepare(UPSERT_NODE_REVIEW_SQL).run(...rebuild(row, db.prepare(EVENTS).all(id),
      settings, db.prepare(ANCESTORS).all(id)));
  }
}

export async function migrateCompanionFsrs7(db: DbPort) {
  const columns = await db.query<{ name: string }>('PRAGMA table_info(node_review)');
  if (!columns.some(column => column.name === 'stability_fast')) {
    await db.run('ALTER TABLE node_review ADD COLUMN stability_fast REAL NOT NULL DEFAULT 0');
  }
  await db.run('DROP TRIGGER IF EXISTS daily_flow_node_review_update');
  for (const sql of DAILY_FLOW_LEARNING_TRIGGERS) await db.run(sql);
  const settings = await db.query(SETTINGS);
  for (const row of await db.query(CARDS)) {
    const { node_id: id } = previousCard.parse(row);
    await db.run(UPSERT_NODE_REVIEW_SQL, rebuild(row, await db.query(EVENTS, [id]),
      settings, await db.query(ANCESTORS, [id])));
  }
}
