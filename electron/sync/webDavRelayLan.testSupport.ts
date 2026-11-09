import { createServer } from 'node:http';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { respondRequestSyncRoundControl, withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { captureWebDavRelayLanBaseline } from '../../lib/core/sync/webDavRelayLanBaseline.js';
import { SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION } from '../../lib/platform/syncGroupMemberStateContract.js';
import type { WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';
import type { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';

export const webDavTestGroupKey = new Uint8Array(32).fill(7);

export async function runWebDavTestLanRound(source: RestorePeer, target: RestorePeer, binding?: WebDavRelayBinding) {
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: source.id,
    initiatorLibraryEpoch: source.epoch, responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
  const confirmSource = await captureWebDavRelayLanBaseline(source.host, binding, context, 'initiator');
  const confirmTarget = await captureWebDavRelayLanBaseline(target.host, binding, context, 'responder');
  const id = crypto.randomUUID();
  const owner = createSyncPeerRoundOwnership(15_000);
  const lease = owner.acquireOutbound(target.id, id)!;
  const round = { id, lease, admitted: false, databaseConfirmed: false };
  const server = lanServer(source, target, id, confirmTarget);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('lan_fixture_address_missing');
    const exchange = createDesktopRequestSyncExchange({ context, groupKey: webDavTestGroupKey,
      groupSecret: Buffer.from(webDavTestGroupKey).toString('base64url'), peerRound: round,
      endpointUrl: `http://127.0.0.1:${address.port}` });
    const host = { ...source.host, enqueueSearchInvalidations: source.desktop };
    return await withRequestSyncPeerRound(exchange, round, async () => {
      const result = await runRequestSyncDatabaseRound({
        exchangeInventory: async () => {
          const inventory = await exchangeRequestSyncInventory(host, exchange);
          return { ...inventory, local: inventory.local.filter(value => value.objectType === 'node'),
            remote: inventory.remote.filter(value => value.objectType === 'node') };
        },
        transferObjects: differences => transferRequestSyncBatch(host, exchange, differences, { peerState: state(target) }),
        reportObjectError: (_difference, error) => { throw error; }
      });
      if (result.complete) {
        await confirmSource?.();
        round.databaseConfirmed = true;
      }
      return result;
    });
  } finally {
    owner.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function lanServer(source: RestorePeer, target: RestorePeer, roundId: string, onCompleted?: () => Promise<void>) {
  const host = { ...target.host, enqueueSearchInvalidations: target.desktop };
  return createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({ request, response,
      localIdentity: { deviceId: target.id, libraryEpoch: target.epoch },
      authenticate: () => ({ ok: true, device_id: source.id, device_name: source.id }),
      onStream: async input => {
        const mode = new URL(request.url!, 'http://localhost').searchParams.get('request');
        if (mode === 'round_finish') {
          return respondRequestSyncRoundControl({ ...input, groupKey: webDavTestGroupKey, roundId, onCompleted });
        }
        if (mode !== 'inventory' && mode !== 'objects' && mode !== 'pulls') throw new Error('lan_fixture_mode_invalid');
        return respondRequestSyncDatabase(host, { ...input, groupKey: webDavTestGroupKey, mode,
          batch: { peerState: state(source) } }, prepareDesktopRequestSyncBody);
      }
    }).catch(error => response.destroy(error));
  });
}

function state(peer: RestorePeer) {
  return { contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION, group_id: 'group',
    sender_device_identity_key: peer.id, library_epoch: peer.epoch, proof_revision: 0,
    source_proof_revisions: {}, devices: [], removals: [], restore: null };
}
