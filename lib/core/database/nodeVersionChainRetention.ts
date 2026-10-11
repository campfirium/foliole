import { nodeVersionChainMetadataSql } from '../sync/nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from '../sync/nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL, REQUEST_LOCAL_REFERENCES_SQL, REQUEST_MEMBER_REFERENCES_SQL, REQUEST_LOCAL_DEVICE_SQL,
  requestSyncReferenceSet, type RequestMemberPosition } from '../sync/requestSyncBodyReferencePolicy.js';

import type { DatabaseDriver } from './driver.js';
import { releasedVersionBodyHashesWithDriver } from './releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';

/** Synchronous host adapter for the same chain planner used by DbPort hosts. */
export function collectNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string) {
  return driver.transaction(() => {
    const node = driver.queryOne<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
      REQUEST_CHAIN_HEAD_SQL, [nodeId]);
    if (node?.kind !== 'topic' || !node.current_version_id || node.sync_dirty !== 0) return;
    const refs = driver.queryAll<{ version_id: string | null }>(REQUEST_LOCAL_REFERENCES_SQL, Array<string>(10).fill(nodeId));
    const local = driver.queryOne<{ local_device_identity_key: string }>(REQUEST_LOCAL_DEVICE_SQL);
    const positions = driver.queryAll<RequestMemberPosition>(REQUEST_MEMBER_REFERENCES_SQL, [nodeId]);
    const references = requestSyncReferenceSet(node.current_version_id, refs, positions, local?.local_device_identity_key);
    if (references.skipped) return;
    const plan = planNodeVersionMetadataChain(driver.queryAll<ChainVersionMetadata>(nodeVersionChainMetadataSql(), [nodeId]),
      driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), references.keep, new Set(), Number.MAX_SAFE_INTEGER, new Set([node.current_version_id]));
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
