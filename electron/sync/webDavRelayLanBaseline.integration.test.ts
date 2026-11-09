// @vitest-environment node
import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { captureWebDavRelayLanBaseline, createWebDavRelayInboundBaselines,
  readWebDavRelayLanBaseline } from '../../lib/core/sync/webDavRelayLanBaseline.js';
import { requestNodeRound, restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

const binding = { id: '7c6d39f9-c0d4-4371-914b-787322f34142', group_id: 'group',
  desktop_device_id: 'source', phone_device_id: 'target', directory_url: 'http://localhost/relay/' };
const context = { groupId: binding.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
  responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' } as const;
const sourceScope = { binding, localDevice: 'source', localEpoch: 'source-epoch', peerEpoch: 'target-epoch' };
const targetScope = { binding, localDevice: 'target', localEpoch: 'target-epoch', peerEpoch: 'source-epoch' };

it('keeps edits made after LAN inventory eligible on both SQLite hosts after reopening', async () => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source');
    const target = await fixture.companionPeer('target');
    await source.seed('shared');
    expect(await requestNodeRound(source, target)).toMatchObject({ complete: true });

    const inbound = createWebDavRelayInboundBaselines();
    const round = new AbortController();
    await inbound.capture(round.signal, () =>
      captureWebDavRelayLanBaseline(target.host, binding, context, 'responder', round.signal));
    const confirmed = await captureWebDavRelayLanBaseline(source.host, binding, context, 'initiator');
    expect(await requestNodeRound(source, target)).toMatchObject({ complete: true, transferred: 0 });
    expect(await readWebDavRelayLanBaseline(source.db, sourceScope)).toBeNull();
    expect(await readWebDavRelayLanBaseline(target.db, targetScope)).toBeNull();

    await source.seed('mac-after-inventory');
    const phoneEdit = textBranch('phone-after-inventory-v1', 'New phone text');
    await applySyncNodesWithDbPort(target.db, [{ ...phoneEdit, object_id: 'phone-after-inventory',
      snapshot: { ...phoneEdit.snapshot, id: 'phone-after-inventory' } }], { enqueueSearchInvalidations: false });
    // Subsequent inventory requests in this same round must never move the captured boundary.
    await inbound.capture(round.signal, () =>
      captureWebDavRelayLanBaseline(target.host, binding, context, 'responder', round.signal));
    await confirmed?.();
    await inbound.confirm(round.signal);
    source.reopen();
    target.reopen();

    for (const [peer, scope, expected] of [
      [source, sourceScope, 'mac-after-inventory'],
      [target, targetScope, 'phone-after-inventory']
    ] as const) {
      const baseline = await readWebDavRelayLanBaseline(peer.db, scope);
      expect(baseline).not.toBeNull();
      expect(await peer.db.query(`SELECT object_id FROM sync_object_state
        WHERE object_type = 'node' AND state_seq > ? ORDER BY object_id`, [baseline!.sequence]))
        .toEqual([{ object_id: expected }]);
      expect(await readWebDavRelayLanBaseline(peer.db, { ...scope, peerEpoch: 'restored' })).toBeNull();
    }
  } finally {
    await fixture.close();
  }
});
