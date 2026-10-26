import { z } from 'zod';


import { resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting } from '../review/nodeSettings.js';
import { recomputeReview } from '../review/recomputeReview.js';
import { normalizeReviewSchedulerSettings } from '../review/settings.js';
import { resolveReviewWeights, type ReviewTrainingNode } from '../review/trainingModel.js';
import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';
import { identityReviewRowSchema, REVIEW_FACT_COLUMNS } from '../sync/syncFactRowSchemas.js';

import type { DatabaseDriver } from './driver.js';
import { ungradedInitialReviewCard } from './initialReviewSchedule.js';
import { createUpsertNodeReviewStatement, UPSERT_NODE_REVIEW_SQL } from './nodeReviewMutationStatements.js';
import { parseReviewModels, readNodeReviewWeights, REVIEW_MODELS_SQL, REVIEW_TRAINING_ANCESTORS_SQL } from './reviewTrainingModels.js';

const EVENTS = `SELECT ${REVIEW_FACT_COLUMNS.join(', ')} FROM review_log WHERE node_id = ?`;
const SETTINGS = `SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'
  AND scope = 'user_space' ORDER BY updated_at DESC, content_hash DESC LIMIT 1`;
const ANCESTORS = `WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, desired_retention, enable_short_term FROM nodes WHERE id = ?
  UNION SELECT n.id, n.parent_id, n.desired_retention, n.enable_short_term FROM nodes n JOIN ancestors a ON n.id = a.parent_id
) SELECT * FROM ancestors`;
const settingRow = z.object({ value_json: z.string() });
const nodeRow = z.object({ id: z.string(), parent_id: z.string().nullable(), desired_retention: z.number().nullable(), enable_short_term: z.number().nullable() });

/** Node-scoped parameter boundary. Retention inherits from the nearest explicit ancestor; trained weights resolve independently from folder ownership. */
function parametersForNode(nodeId: string, settings: unknown[], ancestors: unknown[]) {
  const row = settings[0];
  const global = normalizeReviewSchedulerSettings(row ? JSON.parse(settingRow.parse(row).value_json) : null);
  const nodesById = Object.fromEntries(ancestors.map(value => {
    const node = nodeRow.parse(value);
    return [node.id, { parentNodeId: node.parent_id, desiredRetention: node.desired_retention, enableShortTerm: node.enable_short_term === null
      ? null : node.enable_short_term === 1 }];
  }));
  return { ...global, desiredRetention: resolveNodeDesiredRetentionSetting(nodeId, nodesById, global.desiredRetention).value,
    enableShortTerm: resolveNodeShortTermSetting(nodeId, nodesById).value };
}

export function readNodeReviewParameters(driver: DatabaseDriver, nodeId: string) {
  return { ...parametersForNode(nodeId, driver.queryAll(SETTINGS), driver.queryAll(ANCESTORS, [nodeId])),
    weights: readNodeReviewWeights(driver, nodeId) };
}

function values(nodeId: string, card: SchedulerCard) {
  return [nodeId, card.due, card.last_review, card.state, card.stability, card.difficulty,
    card.elapsed_days, card.scheduled_days, card.reps, card.lapses];
}

export function recomputeNodeReview(driver: DatabaseDriver, nodeId: string) {
  const events = driver.queryAll(EVENTS, [nodeId]).map(row => identityReviewRowSchema.parse(row));
  const initial = driver.queryOne<{ initial_review_due: string | null }>('SELECT initial_review_due FROM nodes WHERE id = ?', [nodeId]);
  const card = recomputeReview(events, readNodeReviewParameters(driver, nodeId))
    ?? ungradedInitialReviewCard(initial?.initial_review_due, events);
  if (card) createUpsertNodeReviewStatement(driver).run(values(nodeId, card));
  else driver.prepare('DELETE FROM node_review WHERE node_id = ?').run([nodeId]);
  return card;
}

/** Caller owns the application transaction, including the fact insert and this projection. */
export async function recomputeNodeReviewWithDb(db: DbPort, nodeId: string) {
  const { events, parameters } = await readNodeReviewHistoryWithDb(db, nodeId);
  const [initial] = await db.query<{ initial_review_due: string | null }>('SELECT initial_review_due FROM nodes WHERE id = ?', [nodeId]);
  const card = recomputeReview(events, parameters)
    ?? ungradedInitialReviewCard(initial?.initial_review_due, events);
  if (card) await db.run(UPSERT_NODE_REVIEW_SQL, values(nodeId, card));
  else await db.run('DELETE FROM node_review WHERE node_id = ?', [nodeId]);
  return card;
}

/** Read through the caller's database owner so scheduling and durable projection share parameters. */
export async function readNodeReviewHistoryWithDb(db: DbPort, nodeId: string) {
  const events = (await db.query(EVENTS, [nodeId])).map(row => identityReviewRowSchema.parse(row));
  const models = parseReviewModels(await db.query<{ key: string; value_json: string }>(REVIEW_MODELS_SQL));
  const modelNodes = await db.query<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_ANCESTORS_SQL, [nodeId]);
  return { events, parameters: {
    ...parametersForNode(nodeId, await db.query(SETTINGS), await db.query(ANCESTORS, [nodeId])),
    weights: resolveReviewWeights(nodeId, modelNodes, models)
  } };
}
