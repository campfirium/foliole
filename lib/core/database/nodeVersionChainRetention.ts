import type { ChainEdge } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from '../sync/nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL } from '../sync/requestSyncBodyReferencePolicy.js';
import { planTopicBodyRetention, TOPIC_BODY_VERSIONS_SQL, TOPIC_EDIT_BASES_SQL,
  type TopicBodyVersion } from '../sync/topicBodyRetentionPlan.js';

import type { DatabaseDriver } from './driver.js';
import { releasedVersionBodyHashesWithDriver } from './releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';

/** Synchronous host adapter for the same chain planner used by DbPort hosts. */
export function collectNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string) {
  return driver.transaction(() => {
    const node = driver.queryOne<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
      REQUEST_CHAIN_HEAD_SQL, [nodeId]);
    if (node?.kind !== 'topic' || !node.current_version_id) return;
    const plan = planTopicBodyRetention(driver.queryAll<TopicBodyVersion>(TOPIC_BODY_VERSIONS_SQL, [nodeId]),
      driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), node.current_version_id,
      driver.queryAll<{ version_id: string }>(TOPIC_EDIT_BASES_SQL, [nodeId]), Number.MAX_SAFE_INTEGER);
    const releasedHashes = new Set((plan.removed ?? []).flatMap((id) =>
      releasedVersionBodyHashesWithDriver(driver, id)));
    for (const statement of chainMutationStatements(plan)) driver.execute(statement.sql, statement.params);
    if (releasedHashes.size) {
      collectTextBodyBlobCandidates(driver, [...releasedHashes]);
    }
  });
}

export function collectAllNodeVersionChainsWithDriver(driver: DatabaseDriver) {
  for (const node of driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones')) {
    collectNodeVersionChainWithDriver(driver, node.id);
  }
}
