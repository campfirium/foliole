// @vitest-environment node
import { rm } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { companionContinuationBridge } from './companionFramedSyncContinuation.testSupport.js';
import { receiveDesktopFramedSyncRoundStream } from './desktopFramedSyncInboundRound.js';
import { requestDesktopFramedSyncDifferenceHttp } from './desktopFramedSyncInventoryHttp.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

const context = { groupId: 't326-group', protocolVersion: 22 as const,
  initiatorDeviceId: 'desktop-a', initiatorLibraryEpoch: 'desktop-a-epoch',
  responderDeviceId: 'desktop-b', responderLibraryEpoch: 'desktop-b-epoch' };
const transferContext = { groupId: context.groupId, protocolVersion: context.protocolVersion,
  receiverDeviceId: context.initiatorDeviceId, receiverLibraryEpoch: context.initiatorLibraryEpoch,
  senderDeviceId: context.responderDeviceId, senderLibraryEpoch: context.responderLibraryEpoch };

it.each([false, true])('retries an invalidated requested publication after sender restart=%s', async restart => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let bridge = companionContinuationBridge(fixture.leftSnapshot, fixture.rightSnapshot);
  const content = 'Complete immutable retry body 😀\n'.repeat(4096);
  const nodeId = 't326-invalidated-request';
  try {
    await fixture.right.seed({ nodeId, title: 'Retry', content });
    const [difference] = compareFramedSyncInventories({ local: [], remote: await readFixtureInventory(fixture.right) });
    if (!difference) throw new Error('fixture_difference_missing');
    const groupKey = new Uint8Array(32).fill(7);
    const input = () => ({ context, db: bridge.db, groupKey, groupSecret: Buffer.from(groupKey).toString('base64url'),
      noncePort: createDesktopFramedSyncSessionNoncePort(bridge.db),
      endpointUrl: fixture.rightSnapshot.origin, roundId: new Uint8Array(16).fill(9),
      staging: createDesktopFramedSyncStaging(bridge.db) });
    const first = await requestDesktopFramedSyncDifferenceHttp({ ...input(), difference });
    const old = decodeFramedSyncPreamble(first.preamble);
    if (old.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
    await expect(receiveDesktopFramedSyncRoundStream({ ...input(), staging: {
      ...input().staging, finalizeInboundAttempt: async () => { throw new Error('injected_receiver_cleanup_failure'); }
    } }, first, difference)).rejects.toThrow('injected_receiver_cleanup_failure');
    expect(bridge.sqlite.prepare('SELECT state FROM framed_sync_inbound_attempts').pluck().all()).toEqual(['invalidated']);
    expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes).toEqual([]);
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).framedSync.outboundHolds).toBeGreaterThan(0);
    bridge.sqlite.close();
    await fixture.restartLeft();
    if (restart) fixture.rightSnapshot = (await fixture.restartRight()).snapshot;
    bridge = companionContinuationBridge(fixture.leftSnapshot, fixture.rightSnapshot);
    const retry = await requestDesktopFramedSyncDifferenceHttp({ ...input(), difference });
    const fresh = decodeFramedSyncPreamble(retry.preamble);
    if (fresh.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
    expect(fresh.contextId).toEqual(old.contextId);
    expect(fresh.attemptId).not.toEqual(old.attemptId);
    expect(fresh.noncePrefix).not.toEqual(old.noncePrefix);
    const response = await receiveDesktopFramedSyncTransfer({ ...input(), context: transferContext, stream: retry });
    await response.dispose?.();
    const applied = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    expect(applied.nodes).toEqual([expect.objectContaining({ id: nodeId, content })]);
    expect(applied.framedSync.receipts).toBe(1);
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).framedSync.outboundHolds).toBeGreaterThan(0);
    const lostReceiptRetry = await requestDesktopFramedSyncDifferenceHttp({ ...input(), difference });
    await receiveDesktopFramedSyncRoundStream(input(), lostReceiptRetry, difference);
    bridge.sqlite.close();
    const reopened = await fixture.restartLeft();
    bridge = companionContinuationBridge(reopened.snapshot, fixture.rightSnapshot);
    const durable = readDesktopFramedSyncLibraryEvidence(reopened.snapshot.databasePath);
    expect(durable.nodes).toEqual(applied.nodes);
    expect(durable.versions).toEqual(applied.versions);
    expect(durable.framedSync.receipts).toBe(1);
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).framedSync.outboundHolds).toBe(0);
  } finally {
    if (bridge.sqlite.open) bridge.sqlite.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);
