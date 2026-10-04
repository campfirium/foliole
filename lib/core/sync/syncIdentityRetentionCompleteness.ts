import type { DbPort } from './dbPort.js';
import { planNodeVersionChain, type ChainEdge, type ChainVersion } from './nodeVersionChainPlan.js';

/** Check required bodies and original lineage without loading retained body text. */
export async function syncIdentityRetentionIsComplete(port: DbPort, schema: string,
  nodeId: string, requirements: { headId: string | null; protectedIds: string[]; frozenIds: string[] }) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  const versions = await port.query<ChainVersion>(`SELECT version_id, object_id, parent_version_id,
    CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
      OR json_type(snapshot_json, '$.content') IS NULL THEN '' ELSE NULL END AS body_text,
    '{"content":null}' AS snapshot_json FROM ${schema}.node_sync_versions WHERE object_id = ?`, [nodeId]);
  const edges = await port.query<ChainEdge>(`SELECT edge.version_id, edge.parent_version_id, edge.ordinal
    FROM ${schema}.node_sync_version_parents edge JOIN ${schema}.node_sync_versions version
      ON version.version_id = edge.version_id WHERE version.object_id = ?`, [nodeId]);
  const plan = planNodeVersionChain(versions, edges, new Set(requirements.protectedIds),
    new Set(requirements.frozenIds), Number.MAX_SAFE_INTEGER,
    new Set(requirements.headId ? [requirements.headId] : []));
  return plan.skipped === null;
}
