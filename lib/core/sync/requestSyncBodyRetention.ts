import { PRESERVE_RELEASED_MAIN_HASH_SQL, releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';


import type { DbPort } from './dbPort.js';
import { CHAIN_VERSION_METADATA_SQL } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import type { ChainEdge } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements } from './nodeVersionChainSql.js';
import { REQUEST_LOCAL_REFERENCES_SQL, REQUEST_LOCAL_DEVICE_SQL, REQUEST_MEMBER_REFERENCES_SQL, requestSyncReferenceSet, type RequestMemberPosition } from './requestSyncBodyReferencePolicy.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { planTopicBodyRetention, TOPIC_BODY_VERSIONS_SQL, TOPIC_EDIT_BASES_SQL, type TopicBodyVersion } from './topicBodyRetentionPlan.js';

export async function planStoredTopicBodies(db: DbPort, nodeId: string, headId: string, limit: number) {
  return planTopicBodyRetention(await db.query<TopicBodyVersion>(TOPIC_BODY_VERSIONS_SQL, [nodeId]),
    await db.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), headId,
    await db.query<{ version_id: string }>(TOPIC_EDIT_BASES_SQL, [nodeId]), limit);
}

export async function requestSyncBodyReferences(db: DbPort, nodeId: string, headId: string) {
  const plan = await planStoredTopicBodies(db, nodeId, headId, 1);
  return { keep: new Set(plan.requiredBodyIds), skipped: plan.skipped };
}

export async function requestSyncPositionReady(db: DbPort, nodeId: string, headId: string) {
  const [node] = await db.query<{ kind: string }>(REQUEST_CHAIN_HEAD_SQL, [nodeId]);
  if (node?.kind !== 'topic') {
    const refs = await db.query<{ version_id: string | null }>(REQUEST_LOCAL_REFERENCES_SQL, Array<string>(10).fill(nodeId));
    const [local] = await db.query<{ local_device_identity_key: string }>(REQUEST_LOCAL_DEVICE_SQL);
    const positions = await db.query<RequestMemberPosition>(REQUEST_MEMBER_REFERENCES_SQL, [nodeId]);
    const { keep } = requestSyncReferenceSet(headId, refs, positions, local?.local_device_identity_key);
    return planNodeVersionMetadataChain(await db.query<ChainVersionMetadata>(CHAIN_VERSION_METADATA_SQL, [nodeId]),
      await db.query<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, new Set(), 1, new Set([headId])).skipped === null;
  }
  return (await planStoredTopicBodies(db, nodeId, headId, 1)).skipped === null;
}

export async function collectRequestSyncBodies(port: DbPort, nodeId: string, limit = 32) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_version_collection_limit');
  return port.transaction(async tx => {
    const [node] = await tx.query<{ kind: string; current_version_id: string | null; sync_dirty: number }>(
      REQUEST_CHAIN_HEAD_SQL, [nodeId]);
    if (node?.kind !== 'topic') return { released: 0, skipped: 'non_topic' };
    if (!node.current_version_id) return { released: 0, skipped: 'unversioned_or_dirty' };
    const plan = await planStoredTopicBodies(tx, nodeId, node.current_version_id, limit);
    const hashes = new Set<string>();
    for (const id of plan.removed ?? []) {
      const released = await releasedVersionBodyHashesWithPort(tx, id);
      for (const hash of released.hashes) hashes.add(hash);
      if (released.mainBodyHash) await tx.run(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, id]);
    }
    for (const statement of chainMutationStatements(plan)) await tx.run(statement.sql, statement.params);
    if (hashes.size) await collectTextBodyBlobCandidatesWithPort(tx, [...hashes]);
    return { released: plan.removed?.length ?? 0, skipped: plan.skipped };
  });
}
