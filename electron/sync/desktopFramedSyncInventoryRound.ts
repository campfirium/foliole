import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { exchangeDesktopFramedSyncInventoryHttp } from './desktopFramedSyncInventoryHttp.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function runDesktopFramedSyncInventoryRound(args: {
  localLibraryEpoch: string;
  peer: DesktopSyncGroupPeer;
  remoteLibraryEpoch: string;
}) {
  const runtime = await loadRoundRuntime(args.peer.group_id);
  const local = { deviceId: args.peer.local_device_id, libraryEpoch: args.localLibraryEpoch };
  const remote = { deviceId: args.peer.peer_device_id, libraryEpoch: args.remoteLibraryEpoch };
  const inventories = await exchangeDesktopFramedSyncInventoryHttp({
    context: {
      groupId: args.peer.group_id,
      initiatorDeviceId: local.deviceId,
      initiatorLibraryEpoch: local.libraryEpoch,
      protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      responderDeviceId: remote.deviceId,
      responderLibraryEpoch: remote.libraryEpoch
    },
    db: runtime.db,
    endpointUrl: args.peer.endpoint_url,
    groupKey: runtime.groupKey,
    groupSecret: runtime.groupSecret,
    noncePort: runtime.noncePort
  });
  const differences = compareFramedSyncInventories(inventories);
  const endpoint = createDesktopFramedSyncRoundEndpoint({
    db: runtime.db,
    groupId: args.peer.group_id,
    groupSecret: runtime.groupSecret,
    local,
    peer: remote,
    peerOrigin: args.peer.endpoint_url,
    staging: runtime.staging
  });
  return sendLocalDifferences(differences, endpoint);
}

async function sendLocalDifferences(
  differences: ReturnType<typeof compareFramedSyncInventories>,
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>
) {
  let pending = differences.filter((difference) => difference.direction === 'remote_to_local').length;
  let transferred = 0;
  for (const difference of differences) {
    if (difference.direction !== 'local_to_remote') continue;
    const selection = await endpoint.selectOutbound(difference);
    if (selection.kind === 'deferred') { pending += 1; continue; }
    await endpoint.staging.publishOutbound(selection.publication);
    const state = await endpoint.sendPublishedTransfer({
      difference,
      publication: selection.publication,
      receiver: 'remote'
    });
    transferred += 1;
    if (state === 'pending') pending += 1;
  }
  return { complete: pending === 0, pending, transferred };
}

function loadRoundRuntime(groupId: string) {
  return runWithDatabaseConnectionOwner(() => {
    const workgroup = loadDesktopWorkgroupKey(groupId);
    if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
    const connection = openDatabaseConnection();
    const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-round' });
    return {
      db,
      groupKey: new Uint8Array(Buffer.from(workgroup.group_key, 'base64url')),
      groupSecret: workgroup.group_key,
      noncePort: createDesktopFramedSyncSessionNoncePort(db),
      staging: createDesktopFramedSyncStaging(db)
    };
  });
}
