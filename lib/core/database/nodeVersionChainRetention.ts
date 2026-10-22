import type { ChainEdge } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from '../sync/nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL } from '../sync/requestSyncBodyReferencePolicy.js';
import { planTopicBodyRetention, TOPIC_BODY_VERSIONS_SQL, TOPIC_EDIT_BASES_SQL,
  type TopicBodyVersion } from '../sync/topicBodyRetentionPlan.js';

import type { DatabaseDriver } from './driver.js';
import { PRESERVE_RELEASED_MAIN_HASH_SQL, releasedVersionBodyHashesWithDriver } from './releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';

/** Retire replaced topic bodies; the caller decides when released blobs are collected. */
export function retireNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
    REQUEST_CHAIN_HEAD_SQL, [nodeId]);
  if (node?.kind !== 'topic' || !node.current_version_id) return { removed: [], releasedHashes: [] };
  const plan = planTopicBodyRetention(driver.queryAll<TopicBodyVersion>(TOPIC_BODY_VERSIONS_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), node.current_version_id,
    driver.queryAll<{ version_id: string }>(TOPIC_EDIT_BASES_SQL, [nodeId]), Number.MAX_SAFE_INTEGER);
  const releasedHashes = new Set<string>();
  for (const id of plan.removed) {
    const released = releasedVersionBodyHashesWithDriver(driver, id);
    for (const hash of released.hashes) releasedHashes.add(hash);
    if (released.mainBodyHash) driver.execute(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, id]);
  }
  for (const statement of chainMutationStatements(plan)) driver.execute(statement.sql, statement.params);
  return { removed: plan.removed, releasedHashes: [...releasedHashes] };
}

/** Synchronous host adapter for the same chain planner used by DbPort hosts. */
export function collectNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string) {
  return driver.transaction(() => {
    const { releasedHashes } = retireNodeVersionChainWithDriver(driver, nodeId);
    if (releasedHashes.length) collectTextBodyBlobCandidates(driver, releasedHashes);
  });
}

export function collectAllNodeVersionChainsWithDriver(driver: DatabaseDriver) {
  for (const node of driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones')) {
    collectNodeVersionChainWithDriver(driver, node.id);
  }
}
