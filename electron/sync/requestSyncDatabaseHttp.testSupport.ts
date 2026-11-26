import http from 'node:http';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase, type RequestSyncDatabaseResponseInput } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { updateSyncUnsyncedItems } from '../../lib/core/sync/syncUnsyncedItems.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import type { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';

export const groupKey = new Uint8Array(32).fill(7);
export const state = (id: string): SyncGroupMemberStatePayload => ({ contract_version: 3, group_id: 'group',
  sender_device_identity_key: id, library_epoch: `${id}-epoch`, proof_revision: 0,
  source_proof_revisions: {}, devices: [], removals: [], restore: null });

export function record(id: string, version: string, parent?: NativeSyncNodeRecord) {
  const value = textBranch(version, `Body ${version}`, parent);
  return { ...value, object_id: id, snapshot: { ...value.snapshot, id } };
}

export type Peer = ReturnType<Awaited<ReturnType<typeof restoreFixture>>['peer']>;

export function syncServer(source: Peer, target: Peer) {
  return http.createServer((request, response) => {
      void handleCompanionLanFramedSyncPost({ request, response,
        localIdentity: { deviceId: target.id, libraryEpoch: target.epoch },
        authenticate: () => ({ ok: true, device_id: source.id, device_name: source.id }),
        onStream: async input => {
          const mode = new URL(request.url!, 'http://localhost').searchParams.get('request');
          if (mode !== 'inventory' && mode !== 'objects' && mode !== 'pulls') throw new Error('unexpected_mode');
          const operation: RequestSyncDatabaseResponseInput = { ...input, groupKey, mode,
            batch: { peerState: state(source.id) } };
          return respondRequestSyncDatabase(target.host, operation, prepareDesktopRequestSyncBody);
        }
      }).catch(error => response.destroy(error));
    });
}

export async function startSyncRound(server: ReturnType<typeof syncServer>, source: Peer, target: Peer, rejected: string[]) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing_address');
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
    responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
  const exchange = createDesktopRequestSyncExchange({ context, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
  return () => runRequestSyncDatabaseRound({
    exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
    transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
    recordUnsynced: update => updateSyncUnsyncedItems(source.host, target.id, update),
    reportObjectError: (difference, error, stage) => rejected.push(`${difference.globalId}:${stage}:${(error as Error).message}`)
  });
}
