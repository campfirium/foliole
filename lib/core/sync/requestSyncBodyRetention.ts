import { PRESERVE_RELEASED_MAIN_HASH_SQL, releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';


import type { DbPort } from './dbPort.js';
import type { ChainEdge } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from './nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { planTopicBodyRetention, TOPIC_BODY_VERSIONS_SQL, TOPIC_EDIT_BASES_SQL, type TopicBodyVersion } from './topicBodyRetentionPlan.js';

export async function planStoredTopicBodies(db: DbPort, nodeId: string, headId: string, limit: number) {
  return planTopicBodyRetention(await db.query<TopicBodyVersion>(TOPIC_BODY_VERSIONS_SQL, [nodeId]),
    await db.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), headId,
    await db.query<{ version_id: string; keep_body?: number }>(TOPIC_EDIT_BASES_SQL, [nodeId]), limit);
}

export async function requestSyncBodyReferences(db: DbPort, nodeId: string, headId: string) {
  const plan = await planStoredTopicBodies(db, nodeId, headId, 1);
  return { keep: new Set(plan.requiredBodyIds), skipped: plan.skipped };
}

export async function collectRequestSyncBodies(port: DbPort, nodeId: string, limit = 32) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
  return port.transaction(async tx => {
    const [node] = await tx.query<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
      REQUEST_CHAIN_HEAD_SQL, [nodeId]);
    if (node?.kind !== 'topic') return { released: 0, skipped: 'non_topic' };
    if (!node.current_version_id) return { released: 0, skipped: 'unversioned_or_dirty' };
    return releasePlannedBodies(tx, await planStoredTopicBodies(tx, nodeId, node.current_version_id, limit));
  });
}

/** The same collection for several nodes, with their heads and stored topic history read once for all. */
export async function collectRequestSyncBodiesForNodes(port: DbPort, nodeIds: readonly string[], limit = 32) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
  if (!nodeIds.length) return;
  await port.transaction(async tx => {
    const ids = JSON.stringify([...new Set(nodeIds)]);
    const heads = await tx.query<{ id: string; kind: string | null; current_version_id: string | null }>(
      BATCH_CHAIN_HEAD_SQL, [ids]);
    const topics = heads.filter(head => head.kind === 'topic' && head.current_version_id);
    if (!topics.length) return;
    const topicIds = JSON.stringify(topics.map(head => head.id));
    const versions = groupByObject(await tx.query<TopicBodyVersion>(batchSql(TOPIC_BODY_VERSIONS_SQL), [topicIds]));
    const edges = groupByObject(await tx.query<ChainEdge & { object_id: string }>(BATCH_CHAIN_EDGES_SQL, [topicIds]));
    const holds = groupByObject(await tx.query<{ object_id: string; version_id: string; keep_body: number }>(
      `SELECT object_id, version_id, CASE WHEN instr(hold_id, 'editor_history_body:') = 1 THEN 1 ELSE 0 END AS keep_body
       FROM node_version_local_holds WHERE object_id IN (SELECT value FROM json_each(?))`, [topicIds]));
    for (const head of topics) {
      await releasePlannedBodies(tx, planTopicBodyRetention(versions.get(head.id) ?? [], edges.get(head.id) ?? [],
        head.current_version_id!, holds.get(head.id) ?? [], limit));
    }
  });
}

const BATCH_CHAIN_HEAD_SQL = `SELECT requested.value AS id, COALESCE(node.current_version_id, tomb.version_id) AS current_version_id,
  COALESCE(node.kind, json_extract(version.snapshot_json, '$.kind')) AS kind
  FROM json_each(?) requested LEFT JOIN nodes node ON node.id = requested.value
  LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.value
  LEFT JOIN node_sync_versions version ON version.version_id = tomb.version_id`;
const BATCH_CHAIN_EDGES_SQL = `SELECT version.object_id, edge.* FROM node_sync_version_parents edge
  JOIN node_sync_versions version ON version.version_id = edge.version_id
  WHERE version.object_id IN (SELECT value FROM json_each(?)) ORDER BY edge.version_id, edge.ordinal`;

function batchSql(single: string) {
  if (!single.trimEnd().endsWith('WHERE object_id = ?')) throw new Error('topic_body_versions_sql_shape');
  return `${single.trimEnd().slice(0, -'object_id = ?'.length)}object_id IN (SELECT value FROM json_each(?))`;
}

function groupByObject<T extends { object_id: string }>(rows: readonly T[]) {
  const byObject = new Map<string, T[]>();
  for (const row of rows) byObject.set(row.object_id, [...byObject.get(row.object_id) ?? [], row]);
  return byObject;
}

async function releasePlannedBodies(tx: DbPort, plan: ReturnType<typeof planTopicBodyRetention>) {
  const hashes = new Set<string>();
  for (const id of plan.removed ?? []) {
    const released = await releasedVersionBodyHashesWithPort(tx, id);
    for (const hash of released.hashes) hashes.add(hash);
    if (released.mainBodyHash) await tx.run(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, id]);
  }
  for (const statement of chainMutationStatements(plan)) await tx.run(statement.sql, statement.params);
  if (hashes.size) await collectTextBodyBlobCandidatesWithPort(tx, [...hashes]);
  return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
}
