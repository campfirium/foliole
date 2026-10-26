import { reviewModelKey, reviewTrainingModelSchema, resolveReviewWeights,
  type ReviewTrainingModel, type ReviewTrainingNode } from '../review/trainingModel.js';

import type { DatabaseDriver } from './driver.js';

export const REVIEW_MODELS_SQL = `SELECT key, value_json FROM setting_records
  WHERE scope = 'user_space' AND deleted_at IS NULL AND key LIKE 'review_training/%'
  ORDER BY updated_at DESC, content_hash DESC`;
export const REVIEW_TRAINING_NODES_SQL = `SELECT id, parent_id AS parentId, kind FROM nodes WHERE deleted_at IS NULL`;
export const REVIEW_TRAINING_ANCESTORS_SQL = `WITH RECURSIVE ancestors AS (
  SELECT id, parent_id AS parentId, kind FROM nodes WHERE id = ? AND deleted_at IS NULL
  UNION SELECT n.id, n.parent_id, n.kind FROM nodes n JOIN ancestors a ON n.id = a.parentId
  WHERE n.deleted_at IS NULL
) SELECT * FROM ancestors`;

export function parseReviewModels(rows: readonly { key: string; value_json: string }[]): ReviewTrainingModel[] {
  const seen = new Set<string>();
  const models: ReviewTrainingModel[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const model = reviewTrainingModelSchema.parse(JSON.parse(row.value_json));
    if (reviewModelKey(model.folderId) !== row.key) throw new Error('review_model_folder_mismatch');
    models.push(model);
  }
  return models;
}

export function readReviewModels(driver: DatabaseDriver) {
  return parseReviewModels(driver.queryAll<{ key: string; value_json: string }>(REVIEW_MODELS_SQL));
}

export function readNodeReviewWeights(driver: DatabaseDriver, nodeId: string) {
  const nodes = driver.queryAll<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_ANCESTORS_SQL, [nodeId]);
  return resolveReviewWeights(nodeId, nodes, readReviewModels(driver));
}
