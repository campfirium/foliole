import { bytesToHex } from '@noble/hashes/utils.js';

import { loadFramedSyncPendingResourceRequests } from '../../../../../../lib/core/sync/framedSyncPendingResourceRequests.js';
import { startFramedSyncResourceDemandRequest } from '../../../../../../lib/core/sync/framedSyncResourceDemands.js';
import { scanFramedSyncResourceNeeds } from '../../../../../../lib/core/sync/framedSyncResourceNeedScan.js';
import { parseCanonicalAttachmentStorageKey } from '../../../../../../lib/platform/attachmentResource.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

async function isPresent(storageKey: string) {
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (!parsed) throw new Error('framed_sync_resource_storage_key_invalid');
  const resolved = await FolioleCompanionSync.resolveAttachmentResource({
    attachment_id: parsed.contentHash, content_hash: parsed.contentHash,
    mime_type: parsed.mimeType, storage_key: storageKey
  });
  return resolved.status === 'ready';
}

/** Every current scoped node is checked, independently of its database difference. */
export async function runCompanionFramedSyncResourceRound(args: NativeCompanionFramedSyncInventoryRequest,
  roundId: Uint8Array, globalIds: Iterable<string>) {
  const owner = getIosCompanionDatabaseOwner();
  const [identity] = await owner.read((db) => db.query<{ device_id: string; library_epoch: string }>(
    `SELECT state.local_device_identity_key AS device_id, proof.library_epoch
     FROM sync_group_local_state state JOIN node_version_local_proof_state proof ON proof.singleton_id = 1
     WHERE state.singleton_id = 1 AND state.state = 'active' AND state.group_id = ?`, [args.sync_group_id]));
  if (!identity) throw new Error('framed_sync_resource_receiver_identity_missing');
  const receiver = { groupId: args.sync_group_id, receiverDeviceId: identity.device_id,
    receiverLibraryEpoch: identity.library_epoch };
  const result = { pending: 0, scanned: 0, transferred: 0, unavailable: 0 };
  for (const globalId of globalIds) {
    const scanned = await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
      scanFramedSyncResourceNeeds({ db, receiver, globalIds: [globalId], isPresent,
        createId: () => bytesToHex(crypto.getRandomValues(new Uint8Array(16))) })));
    result.scanned += scanned.scanned;
    result.unavailable += scanned.unavailable;
    let after = '';
    for (;;) {
      const page = await owner.read((db) => loadFramedSyncPendingResourceRequests(db, receiver, after, globalId));
      result.unavailable += page.unavailableDemandIds.length;
      for (const resource of page.resources) {
        await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
          startFramedSyncResourceDemandRequest(db, { ...receiver, ...resource }, resource.demandId, resource.sharedStateHash)));
        try {
          await FolioleCompanionSync.pullFramedSyncObject({ ...args, round_id: bytesToHex(roundId),
            object_id: globalId, object_type: 'node', frontier_fact_ids: [], required_relation_ids: [],
            resource_hashes: [], review_fact_ids: [], state_fact_ids: [], resources: [{
              demand_id: resource.demandId, global_id: resource.globalId, version_id: resource.versionId,
              body_hash: resource.bodyHash, storage_key: resource.storageKey, shared_state_hash: bytesToHex(resource.sharedStateHash)
            }] });
          result.transferred += 1;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('framed_sync_resource_source_unavailable')) throw error;
          result.pending += 1;
        }
      }
      if (page.afterId === null) break;
      after = page.afterId;
    }
  }
  return result;
}
