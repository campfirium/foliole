import http from 'node:http';
import path from 'node:path';

import type { Peer } from '../../electron/database/syncLibrary.testSupport';
import { handleCompanionLanFramedSyncPost } from '../../electron/sync/companionLanFramedSyncPost';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles';
import { prepareDesktopRequestSyncBody } from '../../electron/sync/desktopRequestSyncBody';
import { createDesktopRequestSyncExchange } from '../../electron/sync/desktopRequestSyncExchange';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract';

const groupKey = new Uint8Array(32).fill(7);
function state(peer: Peer): SyncGroupMemberStatePayload {
  const proof = peer.db.prepare('SELECT library_epoch,proof_revision FROM node_version_local_proof_state').get() as
    { library_epoch: string; proof_revision: number };
  return { contract_version: 3, group_id: 'group', sender_device_identity_key: peer.id,
    ...proof, source_proof_revisions: {}, devices: [], removals: [], restore: null };
}
function host(peer: Peer) {
  return { enqueueSearchInvalidations: false, files: createDesktopFramedSyncFiles(path.join(path.dirname(peer.file), `http-${peer.name}`)),
    readSnapshot: <T>(read: (db: Peer['port']) => Promise<T>) => peer.port.transaction(read),
    write: <T>(write: (db: Peer['port']) => Promise<T>) => write(peer.port) };
}

/** Real HTTP and production sync transactions; authentication supplies the isolated fixture identities. */
export async function exchangeBodySyncOverHttp(source: Peer, target: Peer, targetAdapter?: RequestSyncDatabaseHost) {
  const targetHost = { ...host(target), ...targetAdapter, files: host(target).files };
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: source.id, initiatorLibraryEpoch: state(source).library_epoch,
    responderDeviceId: target.id, responderLibraryEpoch: state(target).library_epoch } as const;
  const server = http.createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({ request, response,
      localIdentity: { deviceId: target.id, libraryEpoch: state(target).library_epoch },
      authenticate: () => ({ ok: true, device_id: source.id, device_name: source.name }),
      onStream: input => respondRequestSyncDatabase(targetHost, { ...input, groupKey,
        mode: new URL(request.url!, 'http://localhost').searchParams.get('request') as 'inventory' | 'objects' | 'pulls',
        batch: { peerState: state(source) } }, prepareDesktopRequestSyncBody)
    }).catch(error => response.destroy(error));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture_http_address_missing');
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const result = await runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(host(source), exchange),
      transferObjects: differences => transferRequestSyncBatch(host(source), exchange, differences, { peerState: state(target) }),
      reportObjectError: (_difference, error) => { throw error; }
    });
    if (!result.complete) throw new Error('fixture_http_round_incomplete');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
