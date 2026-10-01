import { planNodeVersionChain, type ChainEdge, type ChainVersion } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, CHAIN_VERSIONS_SQL, chainMutationStatements, chainReferencesQuery } from '../sync/nodeVersionChainSql.js';

import type { DatabaseDriver } from './driver.js';

/** Synchronous host adapter for the same chain planner used by DbPort hosts. */
export function collectNodeVersionChainWithDriver(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<{ current_version_id: string | null; sync_dirty: number }>(
    CHAIN_HEAD_SQL, [nodeId]);
  if (!node?.current_version_id || node.sync_dirty !== 0) return;
  const references = chainReferencesQuery(nodeId);
  const refs = driver.queryAll<{ version_id: string | null; frozen: number }>(references.sql, references.params);
  const keep = new Set([node.current_version_id, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
  const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
  const plan = planNodeVersionChain(driver.queryAll<ChainVersion>(CHAIN_VERSIONS_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, frozen, Number.MAX_SAFE_INTEGER);
  for (const statement of chainMutationStatements(plan)) driver.execute(statement.sql, statement.params);
}

export function collectAllNodeVersionChainsWithDriver(driver: DatabaseDriver) {
  for (const node of driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones')) {
    collectNodeVersionChainWithDriver(driver, node.id);
  }
}
