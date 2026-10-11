import { releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';


import type { DbPort } from './dbPort.js';
import { nodeVersionChainMetadataSql } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from './nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL, REQUEST_LOCAL_REFERENCES_SQL, REQUEST_MEMBER_REFERENCES_SQL, REQUEST_LOCAL_DEVICE_SQL,
  requestSyncReferenceSet, type RequestMemberPosition } from './requestSyncBodyReferencePolicy.js';

/** Candidate-1 depends on business positions, never delivery acknowledgements or outbound holds. */
export async function requestSyncBodyReferences(db: DbPort, nodeId: string, headId: string) {
  const refs = await db.query<{ version_id: string | null }>(REQUEST_LOCAL_REFERENCES_SQL, Array<string>(10).fill(nodeId));
  const [local] = await db.query<{ local_device_identity_key: string }>(REQUEST_LOCAL_DEVICE_SQL);
  const positions = await db.query<RequestMemberPosition>(REQUEST_MEMBER_REFERENCES_SQL, [nodeId]);
  return requestSyncReferenceSet(headId, refs, positions, local?.local_device_identity_key);
}

export async function requestSyncPositionReady(db: DbPort, nodeId: string, headId: string) {
  const { keep } = await requestSyncBodyReferences(db, nodeId, headId);
  const versions = await db.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), [nodeId]);
  const edges = await db.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]);
  return planNodeVersionMetadataChain(versions, edges, keep, new Set(), 1, new Set([headId])).skipped === null;
}

export async function collectRequestSyncBodies(port: DbPort, nodeId: string, limit = 32) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
  return port.transaction(async tx => {
    const [node] = await tx.query<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
      REQUEST_CHAIN_HEAD_SQL, [nodeId]);
    if (node?.kind !== 'topic') return { released: 0, skipped: 'non_topic' };
    if (!node.current_version_id || node.sync_dirty !== 0) return { released: 0, skipped: 'unversioned_or_dirty' };
    const references = await requestSyncBodyReferences(tx, nodeId, node.current_version_id);
    if (references.skipped) return { released: 0, skipped: references.skipped };
    const versions = await tx.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), [nodeId]);
    const edges = await tx.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]);
    const plan = planNodeVersionMetadataChain(versions, edges, references.keep, new Set(), limit,
      new Set([node.current_version_id]));
    const hashes = new Set<string>();
    for (const id of plan.removed ?? []) {
      for (const hash of await releasedVersionBodyHashesWithPort(tx, id)) hashes.add(hash);
    }
    for (const statement of chainMutationStatements(plan)) await tx.run(statement.sql, statement.params);
    if (hashes.size) await collectTextBodyBlobCandidatesWithPort(tx, [...hashes]);
    return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
  });
}
