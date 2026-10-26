import type { ReviewTrainingPlan } from '../../platform/nativeReviewTrainingContract.js';
import { resolveNodeShortTermSetting } from '../review/nodeSettings.js';
import { REVIEW_TRAINING_STEP, resolveReviewWeights, type ReviewTrainingInput,
  type ReviewTrainingNode } from '../review/trainingModel.js';

import type { DatabaseDriver } from './driver.js';
import { isSpecialRootNode } from './nodeMutationSpecialRoots.js';
import { EFFECTIVE_REVIEW_PREDICATE } from './reviewLogRecord.js';
import { readReviewModels, REVIEW_TRAINING_NODES_SQL } from './reviewTrainingModels.js';

function trainingCounts(driver: DatabaseDriver, nodes: ReviewTrainingNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const counts = new Map<string | null, number>([[null, 0]]);
  for (const row of driver.queryAll<{ node_id: string; count: number }>(
    `SELECT r.node_id, COUNT(*) AS count FROM review_log r WHERE ${EFFECTIVE_REVIEW_PREDICATE} GROUP BY r.node_id`
  )) {
    if (!byId.has(row.node_id)) continue;
    const chain: ReviewTrainingNode[] = [];
    const seen = new Set<string>();
    let node = byId.get(row.node_id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id); chain.push(node);
      if (node.parentId && !byId.has(node.parentId)) break;
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    if (chain.at(-1)?.parentId) continue;
    counts.set(null, counts.get(null)! + row.count);
    for (const ancestor of chain) if (ancestor.kind === 'folder' && !isSpecialRootNode(ancestor.id)) {
      counts.set(ancestor.id, (counts.get(ancestor.id) ?? 0) + row.count);
    }
  }
  return counts;
}

export function readReviewTrainingPlan(driver: DatabaseDriver, libraryScope: string): ReviewTrainingPlan {
  const nodes = driver.queryAll<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const models = readReviewModels(driver);
  const counts = trainingCounts(driver, nodes);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const depth = (id: string | null) => {
    const seen = new Set<string>();
    while (id && !seen.has(id)) { seen.add(id); id = byId.get(id)?.parentId ?? null; }
    return seen.size;
  };
  const folders = [...counts].filter(([id, count]) =>
    count - (models.find(model => model.folderId === id)?.reviewCount ?? 0) >= REVIEW_TRAINING_STEP
  ).sort(([a], [b]) => depth(a) - depth(b) || (a ?? '').localeCompare(b ?? ''))
    .map(([folderId, reviewCount]) => ({ folderId, reviewCount }));
  return { folders, libraryScope, lastTrainedAt: models.map(model => model.trainedAt).sort().at(-1) ?? null };
}

export function readReviewTrainingInput(driver: DatabaseDriver, folderId: string | null,
  libraryScope: string): ReviewTrainingInput {
  const group = readReviewTrainingPlan(driver, libraryScope).folders.find(folder => folder.folderId === folderId);
  if (!group) throw new Error('review_training_threshold_not_reached');
  const nodes = driver.queryAll<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const folder = folderId === null ? null : nodes.find(node => node.id === folderId);
  if (folderId !== null && (!folder || folder.kind !== 'folder' || isSpecialRootNode(folderId))) {
    throw new Error('review_training_folder_invalid');
  }
  const events = driver.queryAll<ReviewTrainingInput['events'][number] & Record<string, unknown>>(
    `WITH RECURSIVE subtree(id) AS (
      SELECT id FROM nodes WHERE deleted_at IS NULL AND ${folderId === null ? 'parent_id IS NULL' : 'id = ?'}
      UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL
    ) SELECT r.node_id AS nodeId, r.op_id AS opId, r.reviewed_at AS reviewedAt, r.grade, r.kind
      FROM review_log r JOIN subtree s ON s.id = r.node_id
      WHERE r.kind = 'reset' OR (${EFFECTIVE_REVIEW_PREDICATE})
      ORDER BY julianday(r.reviewed_at), r.op_id`, folderId === null ? [] : [folderId]
  );
  const settingNodes = Object.fromEntries(driver.queryAll<{ id: string; parentNodeId: string | null; enableShortTerm: number | null }>(
    'SELECT id, parent_id AS parentNodeId, enable_short_term AS enableShortTerm FROM nodes WHERE deleted_at IS NULL'
  ).map(node => [node.id, { ...node, enableShortTerm: node.enableShortTerm === null ? null : node.enableShortTerm === 1 }]));
  return { ...group, libraryScope, events,
    baselineWeights: folderId === null ? null : resolveReviewWeights(folderId, nodes, readReviewModels(driver), false) ?? null,
    enableShortTerm: folderId === null ? false : resolveNodeShortTermSetting(folderId, settingNodes).value };
}
