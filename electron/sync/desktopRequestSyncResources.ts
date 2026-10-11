import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { runDesktopFramedSyncResourceRound } from './desktopFramedSyncResourceRound.js';
import { loadRoundRuntime } from './desktopFramedSyncRoundRuntime.js';
import type { runDesktopRequestSyncDatabaseRound } from './desktopRequestSyncDatabaseRound.js';

/** Attachment delivery remains the existing independent stage until T343-2. */
export async function continueDesktopRequestSyncResources(input: Parameters<typeof runDesktopRequestSyncDatabaseRound>[0]) {
  const runtime = await loadRoundRuntime(input.peer);
  const [proof] = await runtime.db.query<{ library_epoch: string }>('SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1');
  if (!proof) throw new Error('request_sync_local_epoch_missing');
  const inventory = await readRequestSyncInventorySnapshot(runtime.db);
  return runDesktopFramedSyncResourceRound({ ...runtime, endpointUrl: input.peer.endpoint_url,
    context: { groupId: input.peer.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: input.peer.local_device_id, initiatorLibraryEpoch: proof.library_epoch,
      responderDeviceId: input.peer.peer_device_id, responderLibraryEpoch: input.remoteLibraryEpoch },
    roundId: crypto.getRandomValues(new Uint8Array(16)) }, inventory.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
}
