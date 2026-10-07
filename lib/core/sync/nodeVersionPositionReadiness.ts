import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort } from './dbPort.js';
import { CHAIN_VERSION_METADATA_SQL } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainReferencesQuery } from './nodeVersionChainSql.js';

type Reference = { version_id: string | null; frozen: number };

function ready(headId: string, versions: ChainVersionMetadata[], edges: ChainEdge[], refs: Reference[]) {
  const keep = new Set([headId, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
  const frozen = new Set(refs.flatMap((row) => row.frozen && row.version_id ? [row.version_id] : []));
  return planNodeVersionMetadataChain(versions, edges, keep, frozen, 1, new Set([headId])).skipped === null;
}

/** A new adoption declaration requires the same bases and dependencies as collection. */
export async function nodePositionReady(port: DbPort, nodeId: string, headId: string) {
  const query = chainReferencesQuery(nodeId);
  const refs = await port.query<Reference>(query.sql, query.params);
  const versions = await port.query<ChainVersionMetadata>(CHAIN_VERSION_METADATA_SQL, [nodeId]);
  const edges = await port.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]);
  return ready(headId, versions, edges, refs);
}

export function nodePositionReadyWithDriver(driver: DatabaseDriver, nodeId: string, headId: string) {
  const query = chainReferencesQuery(nodeId);
  return ready(headId, driver.queryAll<ChainVersionMetadata>(CHAIN_VERSION_METADATA_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]),
    driver.queryAll<Reference>(query.sql, query.params));
}
