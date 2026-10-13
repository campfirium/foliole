import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { createDesktopRequestSyncAttachmentHost } from './desktopRequestSyncAttachmentHost.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import type { runDesktopRequestSyncDatabaseRound } from './desktopRequestSyncDatabaseRound.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function continueDesktopRequestSyncResources(input: Parameters<typeof runDesktopRequestSyncDatabaseRound>[0]) {
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(input.peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const { databasePath } = await runWithDatabaseConnectionOwner(resolveRuntimeDataPaths);
  const host = createDesktopRequestSyncDatabaseHost(databasePath);
  const [proof] = await host.readSnapshot(db => db.query<{ library_epoch: string }>(
    'SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1'));
  if (!proof) throw new Error('request_sync_local_epoch_missing');
  const context = { groupId: input.peer.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: input.peer.local_device_id, initiatorLibraryEpoch: proof.library_epoch,
    responderDeviceId: input.peer.peer_device_id, responderLibraryEpoch: input.remoteLibraryEpoch } as const;
  return exchangeRequestSyncAttachments(await createDesktopRequestSyncAttachmentHost(host), createDesktopRequestSyncExchange({
    context, endpointUrl: input.peer.endpoint_url, groupSecret: key.group_key,
    groupKey: new Uint8Array(Buffer.from(key.group_key, 'base64url')),
    ...(input.peerRound ? { peerRound: input.peerRound } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  }), (storageKey, error) => appendMainProcessDiagnosticLog('request_sync_attachment_failed', {
    storageKey, sourceDeviceId: input.peer.peer_device_id, error: String(error)
  }));
}
