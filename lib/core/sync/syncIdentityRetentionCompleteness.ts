import type { DbPort } from './dbPort.js';
import { CHAIN_VERSION_METADATA_SQL } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { qualifyNodeVersionReadSql } from './nodeVersionChainSql.js';

/** Check required bodies and original lineage without loading retained body text. */
export async function syncIdentityRetentionIsComplete(port: DbPort, schema: string,
  nodeId: string, requirements: { headId: string | null; protectedIds: string[]; frozenIds: string[] }) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  const versions = await port.query<ChainVersionMetadata>(
    qualifyNodeVersionReadSql(CHAIN_VERSION_METADATA_SQL, schema), [nodeId]);
  const edges = await port.query<ChainEdge>(`SELECT edge.version_id, edge.parent_version_id, edge.ordinal
    FROM ${schema}.node_sync_version_parents edge JOIN ${schema}.node_sync_versions version
      ON version.version_id = edge.version_id WHERE version.object_id = ?`, [nodeId]);
  const plan = planNodeVersionMetadataChain(versions, edges, new Set(requirements.protectedIds),
    new Set(requirements.frozenIds), Number.MAX_SAFE_INTEGER,
    new Set(requirements.headId ? [requirements.headId] : []));
  return plan.skipped === null;
}
