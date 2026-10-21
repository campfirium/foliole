// @vitest-environment node
import { expect, it } from 'vitest';

import { createDesktopRequestSyncExchange } from '../../electron/sync/desktopRequestSyncExchange.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncInventory, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncPeerRound, type RequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

it.each(['desktop', 'companion'])('releases the remote round after %s rejects a received inventory', async platform => {
  const host = await createCompanionRequestFixture();
  const owner = createSyncPeerRoundOwnership(60_000);
  const peer = host.fixture.rightSnapshot;
  const local = host.fixture.leftSnapshot;
  const database = { files: native.files!,
    readSnapshot: <T>(read: (db: typeof host.db) => Promise<T>) => host.db.transaction(read),
    write: <T>(write: (db: typeof host.db) => Promise<T>) => write(host.db) };
  const context = { groupId: 't326-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: `${local.deviceId}-epoch`,
    responderDeviceId: peer.deviceId, responderLibraryEpoch: `${peer.deviceId}-epoch` } as const;
  async function exchangeInventory(rejectReceived: boolean) {
    const id = crypto.randomUUID();
    const lease = owner.acquireOutbound(peer.deviceId, id)!;
    const round: RequestSyncPeerRound = { id, lease, admitted: false };
    const input = { context, endpointUrl: peer.origin, groupKey: new Uint8Array(32).fill(7),
      groupSecret: Buffer.alloc(32, 7).toString('base64url'), peerRound: round, signal: lease.signal };
    const exchange = platform === 'desktop' ? createDesktopRequestSyncExchange(input)
      : (await import('../shared/platform/companion/sync/framed/companionRequestSyncExchange.js'))
        .createCompanionRequestSyncExchange(database, input);
    const failing: RequestSyncExchange = { ...exchange, request: (url, body, consume) =>
      exchange.request(url, body, async response => {
        const result = await consume(response);
        if (rejectReceived) throw new Error('fixture_received_inventory_rejected');
        return result;
      }) };
    try {
      return await withRequestSyncPeerRound(exchange, round, () => exchangeRequestSyncInventory(database, failing));
    } finally { lease.release(); }
  }
  try {
    await expect(exchangeInventory(true)).rejects.toThrow('fixture_received_inventory_rejected');
    await expect(exchangeInventory(false)).resolves.toBeDefined();
  } finally { owner.close(); await host.close(); }
}, 60_000);
