// @vitest-environment node
import http from 'node:http';

import { expect, it } from 'vitest';

import { isFramedSyncPublicationBatchReady } from '../../lib/core/sync/framedSyncBatchReadiness.js';
import { loadFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { createDesktopFramedSyncDifferenceBatchDelivery } from './desktopFramedSyncDifferenceBatchDelivery.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

it.each([false, true])('schedules real frozen uploads lazily and retries deferred selection=%s', async deferSecond => {
  const a = await verifiedReceiverFixture('First完整正文', 'first');
  const b = await verifiedReceiverFixture('Second😀正文', 'second', a.sender);
  const { server, state } = createReceiverServer(a);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
    const input = { groupId: 'group', groupSecret: Buffer.from(a.groupKey).toString('base64url'),
      local: { deviceId: 'sender', libraryEpoch: 'sender-epoch' },
      peer: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' }, peerOrigin: `http://127.0.0.1:${address.port}` };
    const endpoint = createDesktopFramedSyncRoundEndpoint({ ...input, db: a.sender.db, staging: a.staging });
    const receiver = createDesktopFramedSyncRoundEndpoint({ ...input, local: input.peer, peer: input.local,
      db: a.receiver.db, staging: a.receiver.staging });
    const inventories = { local: await endpoint.readInventory(), remote: await receiver.readInventory() };
    const differences = compareFramedSyncInventories(inventories);
    expect(differences.map(item => [item.direction, item.objectType, item.globalId]))
      .toEqual([['local_to_remote', 'node', 'first'], ['local_to_remote', 'node', 'second']]);
    expect(a.sender.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
    const { observed, selectionCounts, transferIds, events } = observeSelections(endpoint, a.sender,
      () => !deferSecond || state.firstDelivered);
    const deliver = createDesktopFramedSyncDifferenceBatchDelivery(differences, observed);
    const delivered: string[] = [];
    const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async difference => {
      const result = await deliver(difference);
      expect(result).toEqual({ sent: true, state: 'delivered' });
      delivered.push(difference.globalId);
      return result.state;
    }, framedSyncOrderBodyDependencies(inventories));
    expect(deferred).toEqual([]);
    expect(delivered).toEqual(['first', 'second']);
    expect(state.requests).toBe(deferSecond ? 2 : 1);
    expect(state.received).toBe(2);
    expect(selectionCounts.get('first')).toBe(1);
    expect(selectionCounts.get('second')).toBe(deferSecond ? 2 : 1);
    expect(events).toEqual(deferSecond
      ? ['send:start', 'select:first', 'select:second', 'send:start', 'select:second']
      : ['send:start', 'select:first', 'select:second']);
    const ids = [...transferIds.values()];
    expect(new Set(ids.map(id => Buffer.from(id).toString('hex'))).size).toBe(2);
    await verifyDurableDeliveries(a, ids);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    b.close(); a.close();
  }
});


it('defers a child whose parent is unavailable while independent neighbors commit over real HTTP', async () => {
  const a = await verifiedReceiverFixture('First完整正文', 'first');
  const c = await verifiedReceiverFixture('Second😀正文', 'second', a.sender);
  const { server, state } = createReceiverServer(a);
  try {
    await seedMissingParentChild(a);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
    const endpoint = createDesktopFramedSyncRoundEndpoint({ db: a.sender.db, staging: a.staging,
      groupId: 'group', groupSecret: Buffer.from(a.groupKey).toString('base64url'),
      local: { deviceId: 'sender', libraryEpoch: 'sender-epoch' },
      peer: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' }, peerOrigin: `http://127.0.0.1:${address.port}` });
    const inventory = await endpoint.readInventory();
    expect(inventory.some(item => item.globalId === 'zzz-parent')).toBe(true);
    // This scoped round has no parent difference available for dependency recovery.
    const local = inventory.filter(item => item.objectType === 'node' && item.globalId !== 'zzz-parent');
    const differences = compareFramedSyncInventories({ local, remote: [] });
    expect(differences.map(item => item.globalId)).toEqual(['first', 'middle-child', 'second']);
    const child = differences.find(item => item.globalId === 'middle-child');
    if (!child) throw new Error('test_child_difference_missing');
    const selected = await endpoint.selectOutbound(child);
    if (selected.kind !== 'published') throw new Error('test_child_publication_missing');
    expect(isFramedSyncPublicationBatchReady(selected.publication)).toBe(true);
    const deliver = createDesktopFramedSyncDifferenceBatchDelivery(differences, endpoint);
    const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences,
      async difference => (await deliver(difference)).state);
    expect(deferred.map(item => item.globalId)).toEqual(['middle-child']);
    expect(state.requests).toBe(4);
    expect(state.received).toBe(3);
    expect(state.failures).toEqual(['framed_sync_node_parent_missing:zzz-parent', 'framed_sync_node_parent_missing:zzz-parent']);
    expect(await a.staging.loadReceipt(selected.publication.transferId)).toBeNull();
    expect(await a.receiver.staging.loadReceipt(selected.publication.transferId)).toBeNull();
    await verifyDurableDeliveries(a, [a.publication.transferId, c.publication.transferId]);
    expect(a.receiver.sqlite.prepare('SELECT id FROM nodes WHERE id IN (?, ?)').all('middle-child', 'zzz-parent')).toEqual([]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    c.close(); a.close();
  }
});


type Fixture = Awaited<ReturnType<typeof verifiedReceiverFixture>>;

function observeSelections(endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  sender: Fixture['sender'], canSelectSecond: () => boolean) {
  let selectedBeforeSend = 0;
  const selectionCounts = new Map<string, number>();
  const transferIds = new Map<string, Uint8Array>();
  const events: string[] = [];
  const observed: typeof endpoint = {
    ...endpoint,
    async selectOutbound(difference) {
      selectedBeforeSend += 1;
      events.push(`select:${difference.globalId}`);
      selectionCounts.set(difference.globalId, (selectionCounts.get(difference.globalId) ?? 0) + 1);
      if (difference.globalId === 'second' && !canSelectSecond()) {
        return { kind: 'deferred', deferredObjects: [{ objectType: difference.objectType, globalId: difference.globalId }] };
      }
      const selection = await endpoint.selectOutbound(difference);
      if (selection.kind !== 'published') throw new Error('test_real_selection_deferred');
      transferIds.set(difference.globalId, selection.publication.transferId);
      expect(selection.publication.inventoryDifference?.globalId).toBe(difference.globalId);
      const body = selection.publication.manifest.blobs.find(blob => blob.role === 1);
      if (!body) throw new Error('test_selected_frozen_body_missing');
      expect(new TextDecoder().decode(await loadFramedSyncFrozenBody(sender.db, body)))
        .toBe(difference.globalId === 'first' ? 'First完整正文' : 'Second😀正文');
      return selection;
    },
    async sendPublishedTransfers(publications) {
      events.push('send:start');
      expect(selectedBeforeSend).toBe(0);
      const states = await endpoint.sendPublishedTransfers(publications);
      selectedBeforeSend = 0;
      return states;
    }
  };
  return { observed, selectionCounts, transferIds, events };
}

async function verifyDurableDeliveries(a: Fixture, ids: Uint8Array[]) {
  for (const id of ids) {
    const senderReceipt = await a.staging.loadReceipt(id);
    const receiverReceipt = await a.receiver.staging.loadReceipt(id);
    expect(senderReceipt).not.toBeNull();
    expect(receiverReceipt).toEqual(senderReceipt);
  }
  a.reopen();
  expect(a.receiver.sqlite.prepare('SELECT id, content FROM nodes WHERE id IN (?, ?) ORDER BY id').all('first', 'second'))
    .toEqual([{ id: 'first', content: 'First完整正文' }, { id: 'second', content: 'Second😀正文' }]);
  expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
  expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id IN (?, ?)').pluck().get('first', 'second'))
    .toBe(2);
}

function createReceiverServer(a: Fixture) {
  const failures: string[] = [];
  const state = { requests: 0, received: 0, firstDelivered: false, failures };
  const server = http.createServer((request, response) => {
    state.requests += 1;
    void handleCompanionLanFramedSyncPost({ request, response,
      authenticate: () => ({ ok: true, device_id: 'sender', device_name: 'Sender', group_id: 'group' }),
      localIdentity: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' },
      onStream: async ({ stream }) => {
        try {
          const reply = await receiveDesktopFramedSyncTransfer({ stream, context: a.context,
            db: a.receiver.db, staging: a.receiver.staging, groupKey: a.groupKey });
          state.received += 1;
          state.firstDelivered = true;
          return reply;
        } catch (error) {
          state.failures.push(error instanceof Error ? error.message : String(error));
          throw error;
        }
      } });
  });
  return { server, state };
}

async function seedMissingParentChild(a: Fixture) {
  const parent = textBranch('missing-parent-version', 'Parent正文');
  parent.object_id = 'zzz-parent'; parent.snapshot.id = 'zzz-parent'; parent.snapshot.kind = 'folder';
  await a.sender.receive([parent]);
  const child = textBranch('middle-child-version', 'Child正文');
  child.object_id = 'middle-child'; child.snapshot.id = 'middle-child'; child.snapshot.parent_id = 'zzz-parent';
  await a.sender.receive([child]);
  expect(a.sender.sqlite.prepare('SELECT parent_id, position FROM nodes WHERE id = ?').get('middle-child'))
    .toEqual({ parent_id: 'zzz-parent', position: null });
}
