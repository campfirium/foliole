import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort } from './dbPort.js';
import { planNodeVersionChain, type ChainEdge, type ChainVersion } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainReferencesQuery } from './nodeVersionChainSql.js';

// Read body availability without moving historical text across the native bridge.
const POSITION_VERSIONS_SQL = `SELECT version_id, object_id, parent_version_id,
  CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
    OR json_type(snapshot_json, '$.content') IS NULL THEN '' ELSE NULL END AS body_text,
  '{"content":null}' AS snapshot_json FROM node_sync_versions WHERE object_id = ?`;
type Reference = { version_id: string | null; frozen: number };

function ready(headId: string, versions: ChainVersion[], edges: ChainEdge[], refs: Reference[]) {
  const keep = new Set([headId, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
  const frozen = new Set(refs.flatMap((row) => row.frozen && row.version_id ? [row.version_id] : []));
  return planNodeVersionChain(versions, edges, keep, frozen, 1, new Set([headId])).skipped === null;
}

/** A new adoption declaration requires the same bases and dependencies as collection. */
export async function nodePositionReady(port: DbPort, nodeId: string, headId: string) {
  const query = chainReferencesQuery(nodeId);
  const refs = await port.query<Reference>(query.sql, query.params);
  const versions = await port.query<ChainVersion>(POSITION_VERSIONS_SQL, [nodeId]);
  const edges = await port.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]);
  return ready(headId, versions, edges, refs);
}

export function nodePositionReadyWithDriver(driver: DatabaseDriver, nodeId: string, headId: string) {
  const query = chainReferencesQuery(nodeId);
  return ready(headId, driver.queryAll<ChainVersion>(POSITION_VERSIONS_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]),
    driver.queryAll<Reference>(query.sql, query.params));
}
