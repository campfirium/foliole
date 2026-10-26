import type { ReviewTrainingPlan } from '../../platform/nativeReviewTrainingContract.js';
import { resolveNodeShortTermSetting } from '../review/nodeSettings.js';
import { REVIEW_TRAINING_STEP, resolveReviewWeights, type ReviewTrainingInput,
  type ReviewTrainingModel, type ReviewTrainingNode } from '../review/trainingModel.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { isSpecialRootNode } from './nodeMutationSpecialRoots.js';
import { EFFECTIVE_REVIEW_PREDICATE } from './reviewLogRecord.js';
import { parseReviewModels, readReviewModels, REVIEW_MODELS_SQL, REVIEW_TRAINING_NODES_SQL } from './reviewTrainingModels.js';

const COUNTS_SQL = `SELECT r.node_id, COUNT(*) AS count FROM review_log r WHERE ${EFFECTIVE_REVIEW_PREDICATE} GROUP BY r.node_id`;
const SETTINGS_SQL = 'SELECT id, parent_id AS parentNodeId, enable_short_term AS enableShortTerm FROM nodes WHERE deleted_at IS NULL';
type CountRow = { node_id: string; count: number };
type SettingNode = { id: string; parentNodeId: string | null; enableShortTerm: number | null };

function trainingCounts(rows: CountRow[], nodes: ReviewTrainingNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const counts = new Map<string, number>();
  for (const row of rows) {
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
    for (const ancestor of chain) if (ancestor.kind === 'folder' && !isSpecialRootNode(ancestor.id)) {
      counts.set(ancestor.id, (counts.get(ancestor.id) ?? 0) + row.count);
    }
  }
  return counts;
}

export function readReviewTrainingPlan(driver: DatabaseDriver, libraryScope: string): ReviewTrainingPlan {
  const nodes = driver.queryAll<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const models = readReviewModels(driver);
  return createPlan(nodes, models, driver.queryAll<CountRow>(COUNTS_SQL), libraryScope);
}

function createPlan(nodes: ReviewTrainingNode[], models: ReviewTrainingModel[], rows: CountRow[], libraryScope: string) {
  const counts = trainingCounts(rows, nodes);
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
  const latest = [...models].sort((a, b) => b.trainedAt.localeCompare(a.trainedAt)
    || (a.folderId ?? '').localeCompare(b.folderId ?? ''))[0];
  return { folders, libraryScope, lastTrainedAt: latest?.trainedAt ?? null,
    lastTrainedFolderId: latest?.folderId ?? null };
}

export function readReviewTrainingInput(driver: DatabaseDriver, folderId: string | null,
  libraryScope: string): ReviewTrainingInput {
  if (folderId === null) throw new Error('review_training_folder_invalid');
  const group = readReviewTrainingPlan(driver, libraryScope).folders.find(folder => folder.folderId === folderId);
  if (!group) throw new Error('review_training_threshold_not_reached');
  const nodes = driver.queryAll<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const folder = nodes.find(node => node.id === folderId);
  if (!folder || folder.kind !== 'folder' || isSpecialRootNode(folderId)) {
    throw new Error('review_training_folder_invalid');
  }
  return createInput(group, nodes, readReviewModels(driver),
    driver.queryAll<ReviewTrainingInput['events'][number] & Record<string, unknown>>(eventsSql(), [folderId]),
    driver.queryAll<SettingNode>(SETTINGS_SQL), libraryScope);
}

function eventsSql() {
  return `WITH RECURSIVE subtree(id) AS (
      SELECT id FROM nodes WHERE deleted_at IS NULL AND id = ?
      UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL
    ) SELECT r.node_id AS nodeId, r.op_id AS opId, r.reviewed_at AS reviewedAt, r.grade, r.kind
      FROM review_log r JOIN subtree s ON s.id = r.node_id
      WHERE r.kind = 'reset' OR (${EFFECTIVE_REVIEW_PREDICATE})
      ORDER BY julianday(r.reviewed_at), r.op_id`;
}

function createInput(group: { folderId: string; reviewCount: number }, nodes: ReviewTrainingNode[],
  models: ReviewTrainingModel[], events: ReviewTrainingInput['events'], settings: SettingNode[], libraryScope: string): ReviewTrainingInput {
  const { folderId } = group;
  const settingNodes = Object.fromEntries(settings.map(node =>
    [node.id, { ...node, enableShortTerm: node.enableShortTerm === null ? null : node.enableShortTerm === 1 }]));
  return { ...group, libraryScope, events,
    baselineWeights: resolveReviewWeights(folderId, nodes, models, false) ?? null,
    enableShortTerm: resolveNodeShortTermSetting(folderId, settingNodes).value };
}

export async function readReviewTrainingPlanWithDb(db: DbPort, libraryScope: string) {
  const nodes = await db.query<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const models = parseReviewModels(await db.query<{ key: string; value_json: string }>(REVIEW_MODELS_SQL));
  return createPlan(nodes, models, await db.query<CountRow>(COUNTS_SQL), libraryScope);
}

export async function readReviewTrainingInputWithDb(db: DbPort, folderId: string | null, libraryScope: string) {
  if (folderId === null) throw new Error('review_training_folder_invalid');
  const plan = await readReviewTrainingPlanWithDb(db, libraryScope);
  const group = plan.folders.find(folder => folder.folderId === folderId);
  if (!group) throw new Error('review_training_threshold_not_reached');
  const nodes = await db.query<ReviewTrainingNode & Record<string, unknown>>(REVIEW_TRAINING_NODES_SQL);
  const models = parseReviewModels(await db.query<{ key: string; value_json: string }>(REVIEW_MODELS_SQL));
  const events = await db.query<ReviewTrainingInput['events'][number] & Record<string, unknown>>(
    eventsSql(), [folderId]);
  return createInput(group, nodes, models, events, await db.query<SettingNode>(SETTINGS_SQL), libraryScope);
}
