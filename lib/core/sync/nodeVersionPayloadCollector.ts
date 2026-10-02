import { RELEASED_VERSION_BODY_SQL, releasedVersionBodyHashes, type ReleasedVersionBody } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';

import type { DbPort } from './dbPort.js';
import { planNodeVersionChain, type ChainEdge, type ChainVersion } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, CHAIN_VERSIONS_SQL, chainMutationStatements, chainReferencesQuery } from './nodeVersionChainSql.js';

export interface NodeVersionCollectionResult {
  released: number;
  skipped: string | null;
}

/** Version identities, bodies and obsolete edges leave the chain together. */
export async function collectNodeVersionPayloads(port: DbPort, nodeId: string, limit = 32,
  retireLegacyHistory = false): Promise<NodeVersionCollectionResult> {
  return port.transaction(async (tx) => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
    const [node] = await tx.query<{ current_version_id: string | null; sync_dirty: number }>(
      CHAIN_HEAD_SQL, [nodeId]
    );
    if (!node?.current_version_id || node.sync_dirty !== 0) return { released: 0, skipped: 'unversioned_or_dirty' };
    const references = chainReferencesQuery(nodeId, retireLegacyHistory);
    const refs = await tx.query<{ version_id: string | null; frozen: number }>(references.sql, references.params);
    const keep = new Set([node.current_version_id, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
    const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
    const plan = planNodeVersionChain(await tx.query<ChainVersion>(CHAIN_VERSIONS_SQL, [nodeId]),
      await tx.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, frozen, limit, retireLegacyHistory);
    const releasedBodies: ReleasedVersionBody[] = [];
    for (const id of plan.removed ?? []) {
      releasedBodies.push(...await tx.query<ReleasedVersionBody>(RELEASED_VERSION_BODY_SQL, [id]));
    }
    for (const statement of chainMutationStatements(plan)) await tx.run(statement.sql, statement.params);
    if (releasedBodies.length) await collectTextBodyBlobCandidatesWithPort(tx, releasedVersionBodyHashes(releasedBodies));
    return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
  });
}
