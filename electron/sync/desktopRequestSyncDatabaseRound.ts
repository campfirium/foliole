import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncOverwriteInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { runRequestSyncOverwriteRound } from '../../lib/core/sync/requestSyncOverwriteRound.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { withDesktopForegroundTimeMaintenance } from '../database/foregroundTimeMaintenance.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { exchangeDesktopRequestSyncInventory } from './desktopRequestSyncInventoryHttp.js';
import { postDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';
import { prepareDesktopRequestSyncOverwrite } from './desktopRequestSyncOverwrite.js';
import { pullDesktopRequestSyncObject } from './desktopRequestSyncPullHttp.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function runDesktopRequestSyncDatabaseRound(input: {
  peer: DesktopSyncGroupPeer;
  localLibraryEpoch: string;
  remoteLibraryEpoch: string;
  peerState: SyncGroupMemberStatePayload;
  restoreId?: string;
  signal?: AbortSignal;
}) {
  const runtime = await runWithDatabaseConnectionOwner(() => {
    const key = loadDesktopWorkgroupKey(input.peer.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    return { databasePath: openDatabaseConnection().dbPath, groupSecret: key.group_key };
  });
  const host = createDesktopRequestSyncDatabaseHost(runtime.databasePath);
  const adoption = await host.readSnapshot(loadSyncGroupLocalAdoption);
  if (adoption && (adoption.groupId !== input.peer.group_id || adoption.providerDeviceId !== input.peer.peer_device_id)) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const overwriteId = adoption?.libraryEpoch ?? input.restoreId;
  const context = { groupId: input.peer.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: input.peer.local_device_id, initiatorLibraryEpoch: overwriteId ?? input.localLibraryEpoch,
    responderDeviceId: input.peer.peer_device_id, responderLibraryEpoch: input.remoteLibraryEpoch } as const;
  const exchange = { context, endpointUrl: input.peer.endpoint_url, groupSecret: runtime.groupSecret,
    groupKey: new Uint8Array(Buffer.from(runtime.groupSecret, 'base64url')),
    ...(input.signal ? { signal: input.signal } : {}) };
  const port: import('../../lib/core/sync/requestSyncDatabaseRound.js').RequestSyncDatabaseRoundPort = {
    exchangeInventory: async () => exchangeDesktopRequestSyncInventory(host, { ...exchange,
      ...(overwriteId ? { localInventory: await host.readSnapshot(db => readFramedSyncOverwriteInventory(db, {
        groupId: context.groupId, protocolVersion: context.protocolVersion, senderDeviceId: context.responderDeviceId,
        senderLibraryEpoch: context.responderLibraryEpoch, receiverDeviceId: context.initiatorDeviceId,
        receiverLibraryEpoch: context.initiatorLibraryEpoch
      }), input.signal) } : {}) }),
    transferObject: difference => difference.direction === 'local_to_remote'
      ? postDesktopRequestSyncObject(host, { ...exchange, difference })
      : pullDesktopRequestSyncObject(host, { ...exchange, difference,
        peerState: input.peerState }),
    reportObjectError: (difference, error) => appendMainProcessDiagnosticLog('request_sync_object_rejected', {
      objectId: difference.globalId, objectType: difference.objectType,
      sourceDeviceId: difference.direction === 'local_to_remote' ? input.peer.local_device_id : input.peer.peer_device_id,
      error
    })
  };
  if (!overwriteId) return runRequestSyncDatabaseRound(port, input.signal);
  const progress = { groupId: context.groupId, overwriteId, providerDeviceId: context.responderDeviceId,
    providerLibraryEpoch: context.responderLibraryEpoch, receiverDeviceId: context.initiatorDeviceId,
    receiverLibraryEpoch: context.initiatorLibraryEpoch };
  return withDesktopForegroundTimeMaintenance(async () => {
    await prepareDesktopRequestSyncOverwrite(host, progress, input.restoreId);
    return runRequestSyncOverwriteRound(host, progress, port, input.signal);
  }, async () => !await host.readSnapshot(loadSyncGroupOverwriteProgress));
}
