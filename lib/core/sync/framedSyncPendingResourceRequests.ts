import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { readFramedSyncRequestedResources } from './framedSyncResourceRequest.js';

type Receiver = Pick<FramedSyncContext, 'groupId' | 'receiverDeviceId' | 'receiverLibraryEpoch'>;
export const FRAMED_SYNC_RESOURCE_REQUEST_PAGE = 64;

type DemandVersionRow = {
  demand_id: string; global_id: string; version_id: string; body_hash: string; storage_key: string;
  version_body_hash: string | null; content_hash: string | null;
};

/** Started requests use their saved summary; unsent work uses immutable version metadata, never body text. */
export async function loadFramedSyncPendingResourceRequests(db: DbPort, receiver: Receiver, afterId = '', globalId?: string) {
  const rows = await db.query<DemandVersionRow>(`SELECT demand.demand_id, demand.global_id,
    demand.version_id, demand.body_hash, demand.storage_key,
    CASE WHEN demand.request_started = 1 THEN lower(hex(demand.shared_state_hash))
      ELSE version.content_hash END AS content_hash,
    CASE WHEN demand.request_started = 1 THEN demand.body_hash
      ELSE json_extract(version.snapshot_json, '$.body_blob_hash') END AS version_body_hash
    FROM framed_sync_resource_demands demand LEFT JOIN node_sync_versions version
      ON version.version_id = demand.version_id AND version.object_id = demand.global_id
    WHERE demand.group_id = ? AND demand.receiver_device_id = ? AND demand.receiver_library_epoch = ?
      AND demand.state = 'pending' AND demand.demand_id > ?
      ${globalId === undefined ? '' : 'AND demand.global_id = ?'}
    ORDER BY demand.demand_id LIMIT ?`, [receiver.groupId, receiver.receiverDeviceId,
    receiver.receiverLibraryEpoch, afterId, ...(globalId === undefined ? [] : [globalId]), FRAMED_SYNC_RESOURCE_REQUEST_PAGE]);
  const unavailableDemandIds: string[] = [];
  const available = rows.filter((row) => {
    if (row.version_body_hash === row.body_hash && row.content_hash && /^[a-f0-9]{64}$/u.test(row.content_hash)) return true;
    unavailableDemandIds.push(row.demand_id);
    return false;
  });
  return { afterId: rows.at(-1)?.demand_id ?? null, unavailableDemandIds,
    resources: readFramedSyncRequestedResources(available.map((row) => ({
      demandId: row.demand_id, globalId: row.global_id, versionId: row.version_id,
      bodyHash: row.body_hash, storageKey: row.storage_key, sharedStateHash: hexToBytes(row.content_hash!)
    }))) };
}
