import { nodeVersionChainMetadataSql } from '../sync/nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, chainMutationStatements, chainReferencesQuery } from '../sync/nodeVersionChainSql.js';
import { RETIRE_RESOLVED_NODE_POSITIONS_SQL } from '../sync/nodeVersionRetiredPositions.js';
import type { NodeVersionBodyStorage } from '../sync/syncNodeTombstoneVersion.js';

import { collectBodyContentCandidatesWithDriver } from './bodyContentCollectionWithDriver.js';
import type { DatabaseDriver } from './driver.js';
import { releasedVersionBodyHashesWithDriver } from './releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';

/** Synchronous host adapter for the same chain planner used by DbPort hosts. */
export function collectNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string,
  storage: NodeVersionBodyStorage = 'continuous') {
  return driver.transaction(() => {
    const node = driver.queryOne<{ current_version_id: string | null; sync_dirty: number }>(
      CHAIN_HEAD_SQL, [nodeId]);
    if (!node?.current_version_id || node.sync_dirty !== 0) return;
    driver.execute(RETIRE_RESOLVED_NODE_POSITIONS_SQL, [nodeId]);
    const references = chainReferencesQuery(nodeId, false, 'main', storage);
    const refs = driver.queryAll<{ version_id: string | null; frozen: number }>(references.sql, references.params);
    const keep = new Set([node.current_version_id, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
    const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
    const plan = planNodeVersionMetadataChain(driver.queryAll<ChainVersionMetadata>(nodeVersionChainMetadataSql(storage), [nodeId]),
      driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, frozen, Number.MAX_SAFE_INTEGER, new Set([node.current_version_id]));
    const releasedHashes = new Set((plan.removed ?? []).flatMap((id) =>
      storage === 'chunked' ? releasedChunkedHashes(driver, id) : releasedVersionBodyHashesWithDriver(driver, id)));
    for (const statement of chainMutationStatements(plan, storage)) driver.execute(statement.sql, statement.params);
    if (releasedHashes.size) {
      if (storage === 'chunked') collectBodyContentCandidatesWithDriver(driver, [...releasedHashes]);
      else collectTextBodyBlobCandidates(driver, [...releasedHashes]);
    }
  });
}

export function collectAllNodeVersionChainsWithDriver(driver: DatabaseDriver, storage: NodeVersionBodyStorage = 'continuous') {
  for (const node of driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones')) {
    collectNodeVersionChainWithDriver(driver, node.id, storage);
  }
}

function releasedChunkedHashes(driver: DatabaseDriver, versionId: string) {
  return driver.queryAll<{ hash: string | null }>(`SELECT body_blob_hash AS hash
    FROM node_sync_versions WHERE version_id = ?
    UNION SELECT json_extract(alternative.value, '$.body_blob_hash') AS hash
    FROM node_sync_versions version, json_each(version.snapshot_json, '$.text_alternatives') alternative
    WHERE version.version_id = ?`, [versionId, versionId]).flatMap((row) => row.hash ? [row.hash] : []);
}
