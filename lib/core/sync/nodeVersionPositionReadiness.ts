import type { DatabaseDriver } from '../database/driver.js';

import { CHAIN_VERSION_METADATA_SQL } from './nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL } from './nodeVersionChainSql.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { REQUEST_LOCAL_DEVICE_SQL, REQUEST_LOCAL_REFERENCES_SQL, REQUEST_MEMBER_REFERENCES_SQL,
  requestSyncReferenceSet, type RequestMemberPosition } from './requestSyncBodyReferencePolicy.js';
import { planTopicBodyRetention, TOPIC_BODY_VERSIONS_SQL, TOPIC_EDIT_BASES_SQL, type TopicBodyVersion } from './topicBodyRetentionPlan.js';

export { requestSyncPositionReady as nodePositionReady } from './requestSyncBodyRetention.js';

/** Publication and body collection use the same business retention references. */
export function nodePositionReadyWithDriver(driver: DatabaseDriver, nodeId: string, headId: string) {
  const node = driver.queryOne<{ kind: string }>(REQUEST_CHAIN_HEAD_SQL, [nodeId]);
  if (node?.kind === 'topic') return planTopicBodyRetention(
    driver.queryAll<TopicBodyVersion>(TOPIC_BODY_VERSIONS_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), headId,
    driver.queryAll<{ version_id: string }>(TOPIC_EDIT_BASES_SQL, [nodeId]), 1).skipped === null;
  const refs = driver.queryAll<{ version_id: string | null }>(REQUEST_LOCAL_REFERENCES_SQL, Array<string>(10).fill(nodeId));
  const local = driver.queryOne<{ local_device_identity_key: string }>(REQUEST_LOCAL_DEVICE_SQL);
  const positions = driver.queryAll<RequestMemberPosition>(REQUEST_MEMBER_REFERENCES_SQL, [nodeId]);
  const { keep } = requestSyncReferenceSet(headId, refs, positions, local?.local_device_identity_key);
  return planNodeVersionMetadataChain(driver.queryAll<ChainVersionMetadata>(CHAIN_VERSION_METADATA_SQL, [nodeId]),
    driver.queryAll<ChainEdge>(CHAIN_EDGES_SQL, [nodeId]), keep, new Set(), 1, new Set([headId])).skipped === null;
}
