import { collectBodyContentCandidates } from '../database/bodyContentCollection.js';
import { releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';

import type { DbPort } from './dbPort.js';
import { nodeVersionChainMetadataSql } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, chainMutationStatements, chainReferencesQuery } from './nodeVersionChainSql.js';
import { RETIRE_RESOLVED_NODE_POSITIONS_SQL } from './nodeVersionRetiredPositions.js';
import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';

async function releasedChunkedHashes(db: DbPort, versionId: string) {
  const rows = await db.query<{ hash: string | null }>(`SELECT body_blob_hash AS hash
    FROM node_sync_versions WHERE version_id = ?
    UNION SELECT json_extract(alternative.value, '$.body_blob_hash') AS hash
    FROM node_sync_versions version, json_each(version.snapshot_json, '$.text_alternatives') alternative
    WHERE version.version_id = ?`, [versionId, versionId]);
  return rows.flatMap((row) => row.hash ? [row.hash] : []);
}

export interface NodeVersionCollectionResult {
  released: number;
  skipped: string | null;
}

/** Collect replaceable bodies; version identities and original parent edges remain intact. */
export async function collectNodeVersionPayloads(port: DbPort, nodeId: string, limit = 32,
  retireLegacyHistory = false, bodyStorage: NodeVersionBodyStorage = 'continuous'): Promise<NodeVersionCollectionResult> {
  return port.transaction(async (tx) => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
    const [node] = await tx.query<{ current_version_id: string | null; sync_dirty: number }>(
      CHAIN_HEAD_SQL, [nodeId]
    );
    if (!node?.current_version_id || node.sync_dirty !== 0) return { released: 0, skipped: 'unversioned_or_dirty' };
    await tx.run(RETIRE_RESOLVED_NODE_POSITIONS_SQL, [nodeId]);
    const references = chainReferencesQuery(nodeId, retireLegacyHistory, 'main', bodyStorage);
    const refs = await tx.query<{ version_id: string | null; frozen: number }>(references.sql, references.params);
    const keep = new Set([node.current_version_id, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
    const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
    const plan = planNodeVersionMetadataChain(await tx.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(bodyStorage), [nodeId]),
      await tx.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, frozen, limit, new Set([node.current_version_id]));
    const releasedHashes = new Set<string>();
    for (const id of plan.removed ?? []) {
      const hashes = bodyStorage === 'chunked' ? await releasedChunkedHashes(tx, id)
        : await releasedVersionBodyHashesWithPort(tx, id);
      for (const hash of hashes) releasedHashes.add(hash);
    }
    for (const statement of chainMutationStatements(plan, bodyStorage)) await tx.run(statement.sql, statement.params);
    if (releasedHashes.size) {
      if (bodyStorage === 'chunked') await collectBodyContentCandidates(tx, [...releasedHashes]);
      else await collectTextBodyBlobCandidatesWithPort(tx, [...releasedHashes]);
    }
    return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
  });
}
