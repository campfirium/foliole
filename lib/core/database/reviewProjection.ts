import { z } from 'zod';

import { resolveNodeShortTermSetting } from '../review/nodeSettings.js';
import { recomputeReview } from '../review/recomputeReview.js';
import { normalizeReviewSchedulerSettings } from '../review/settings.js';
import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';
import { identityReviewRowSchema, REVIEW_FACT_COLUMNS } from '../sync/syncFactRowSchemas.js';

import type { DatabaseDriver } from './driver.js';
import { createUpsertNodeReviewStatement, UPSERT_NODE_REVIEW_SQL } from './nodeReviewMutationStatements.js';

const EVENTS = `SELECT ${REVIEW_FACT_COLUMNS.join(', ')} FROM review_log WHERE node_id = ?`;
const SETTINGS = `SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'
  AND scope = 'user_space' ORDER BY updated_at DESC, content_hash DESC LIMIT 1`;
const ANCESTORS = `WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, enable_short_term FROM nodes WHERE id = ?
  UNION SELECT n.id, n.parent_id, n.enable_short_term FROM nodes n JOIN ancestors a ON n.id = a.parent_id
) SELECT * FROM ancestors`;
const settingRow = z.object({ value_json: z.string() });
const nodeRow = z.object({ id: z.string(), parent_id: z.string().nullable(), enable_short_term: z.number().nullable() });

/** Node-scoped parameter boundary. Retention and weights remain the existing global settings. */
function parametersForNode(nodeId: string, settings: unknown[], ancestors: unknown[]) {
  const row = settings[0];
  const global = normalizeReviewSchedulerSettings(row ? JSON.parse(settingRow.parse(row).value_json) : null);
  const nodesById = Object.fromEntries(ancestors.map(value => {
    const node = nodeRow.parse(value);
    return [node.id, { parentNodeId: node.parent_id, enableShortTerm: node.enable_short_term === null
      ? null : node.enable_short_term === 1 }];
  }));
  return { ...global, enableShortTerm: resolveNodeShortTermSetting(nodeId, nodesById).value };
}

function values(nodeId: string, card: SchedulerCard) {
  return [nodeId, card.due, card.last_review, card.state, card.stability, card.difficulty,
    card.elapsed_days, card.scheduled_days, card.reps, card.lapses];
}

export function recomputeNodeReview(driver: DatabaseDriver, nodeId: string) {
  const events = driver.queryAll(EVENTS, [nodeId]).map(row => identityReviewRowSchema.parse(row));
  const card = recomputeReview(events, parametersForNode(nodeId, driver.queryAll(SETTINGS), driver.queryAll(ANCESTORS, [nodeId])));
  if (card) createUpsertNodeReviewStatement(driver).run(values(nodeId, card));
  else driver.prepare('DELETE FROM node_review WHERE node_id = ?').run([nodeId]);
  return card;
}

/** Caller owns the application transaction, including the fact insert and this projection. */
export async function recomputeNodeReviewWithDb(db: DbPort, nodeId: string) {
  const events = (await db.query(EVENTS, [nodeId])).map(row => identityReviewRowSchema.parse(row));
  const card = recomputeReview(events, parametersForNode(nodeId, await db.query(SETTINGS), await db.query(ANCESTORS, [nodeId])));
  if (card) await db.run(UPSERT_NODE_REVIEW_SQL, values(nodeId, card));
  else await db.run('DELETE FROM node_review WHERE node_id = ?', [nodeId]);
  return card;
}
