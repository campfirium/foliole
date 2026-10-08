import { releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';

import type { DbPort } from './dbPort.js';
import { nodeVersionChainMetadataSql } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, chainMutationStatements, chainReferencesQuery } from './nodeVersionChainSql.js';
import { RETIRE_RESOLVED_NODE_POSITIONS_SQL } from './nodeVersionRetiredPositions.js';

export interface NodeVersionCollectionResult {
  released: number;
  skipped: string | null;
}

/** Collect replaceable bodies; version identities and original parent edges remain intact. */
export async function collectNodeVersionPayloads(port: DbPort, nodeId: string, limit = 32,
  retireLegacyHistory = false): Promise<NodeVersionCollectionResult> {
  return port.transaction(async (tx) => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
    const [node] = await tx.query<{ current_version_id: string | null; sync_dirty: number }>(
      CHAIN_HEAD_SQL, [nodeId]
    );
    if (!node?.current_version_id || node.sync_dirty !== 0) return { released: 0, skipped: 'unversioned_or_dirty' };
    await tx.run(RETIRE_RESOLVED_NODE_POSITIONS_SQL, [nodeId]);
    const references = chainReferencesQuery(nodeId, retireLegacyHistory, 'main');
    const refs = await tx.query<{ version_id: string | null; frozen: number }>(references.sql, references.params);
    const keep = new Set([node.current_version_id, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
    const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
    const plan = planNodeVersionMetadataChain(await tx.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), [nodeId]),
      await tx.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, frozen, limit, new Set([node.current_version_id]));
    const releasedHashes = new Set<string>();
    for (const id of plan.removed ?? []) {
      const hashes = await releasedVersionBodyHashesWithPort(tx, id);
      for (const hash of hashes) releasedHashes.add(hash);
    }
    for (const statement of chainMutationStatements(plan)) await tx.run(statement.sql, statement.params);
    if (releasedHashes.size) {
      await collectTextBodyBlobCandidatesWithPort(tx, [...releasedHashes]);
    }
    return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
  });
}
