import http from 'node:http';

import { expect } from 'vitest';

import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { createDesktopFramedSyncDifferenceBatchDelivery } from './desktopFramedSyncDifferenceBatchDelivery.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import type { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

export type ParentBatchFixture = Awaited<ReturnType<typeof verifiedReceiverFixture>>;

export async function seedParentBatchNode(a: ParentBatchFixture, id: string, parentId: string | null) {
  const record = textBranch(`${id}-version`, `${id} complete body`, undefined, '2026-10-09T00:00:00.000Z');
  record.object_id = id;
  record.snapshot.id = id;
  record.snapshot.parent_id = parentId;
  await a.sender.receive([record]);
}

export async function parentBatchHttp(a: ParentBatchFixture) {
  const state = { posts: 0, successful: 0, failed: 0, failures: [] as string[] };
  const receivedTransferIds: string[] = [];
  const responses = new Set<Promise<void>>();
  const server = http.createServer((request, response) => {
    state.posts += 1;
    const complete = handleCompanionLanFramedSyncPost({ request, response,
      authenticate: () => ({ ok: true, device_id: 'sender', device_name: 'Sender', group_id: 'group' }),
      localIdentity: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' },
      onStream: async ({ stream }) => {
        receivedTransferIds.push(Buffer.from(decodeFramedSyncPreamble(stream.preamble).contextId).toString('hex'));
        try {
          return await receiveDesktopFramedSyncTransfer({ stream, context: a.context,
            db: a.receiver.db, staging: a.receiver.staging, groupKey: a.groupKey });
        } catch (error) {
          state.failures.push(error instanceof Error ? error.message : String(error));
          throw error;
        }
      } }).then(() => { if (response.statusCode === 200) state.successful += 1; else state.failed += 1; });
    responses.add(complete);
    void complete.finally(() => responses.delete(complete));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
  const identity = { groupId: 'group', groupSecret: Buffer.from(a.groupKey).toString('base64url'),
    local: { deviceId: 'sender', libraryEpoch: 'sender-epoch' },
    peer: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' }, peerOrigin: `http://127.0.0.1:${address.port}` };
  const endpoint = createDesktopFramedSyncRoundEndpoint({ ...identity, db: a.sender.db, staging: a.staging });
  const receiverEndpoint = createDesktopFramedSyncRoundEndpoint({ ...identity, local: identity.peer,
    peer: identity.local, db: a.receiver.db, staging: a.receiver.staging });
  return { state, endpoint, receivedTransferIds,
    async deliver(ids: readonly string[]) {
      const inventories = { local: await endpoint.readInventory(), remote: await receiverEndpoint.readInventory() };
      const differences = compareFramedSyncInventories(inventories).filter(item => ids.includes(item.globalId));
      expect(differences.map(item => item.globalId)).toEqual(ids);
      const transfers = new Map<string, Uint8Array>();
      for (const difference of differences) {
        const selected = await endpoint.selectOutbound(difference);
        if (selected.kind !== 'published') throw new Error('test_publication_missing');
        transfers.set(difference.globalId, selected.publication.transferId);
      }
      const deliver = createDesktopFramedSyncDifferenceBatchDelivery(differences, endpoint);
      const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences,
        async difference => (await deliver(difference)).state);
      await Promise.all(responses);
      return { transfers, deferred };
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

export async function expectParentBatchDurable(a: ParentBatchFixture, transfers: ReadonlyMap<string, Uint8Array>,
  committed: readonly string[], rejected: readonly string[] = []) {
  const originalReceipts = new Map<string, unknown>();
  for (const id of committed) {
    const transfer = transfers.get(id)!;
    const senderReceipt = await a.staging.loadReceipt(transfer);
    expect(senderReceipt).not.toBeNull();
    expect(await a.receiver.staging.loadReceipt(transfer)).toEqual(senderReceipt);
    originalReceipts.set(id, senderReceipt);
  }
  for (const id of rejected) {
    expect(await a.staging.loadReceipt(transfers.get(id)!)).toBeNull();
    expect(await a.receiver.staging.loadReceipt(transfers.get(id)!)).toBeNull();
  }
  a.reopen();
  for (const id of committed) {
    expect(a.receiver.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get(id)).toBe(`${id} complete body`);
    expect(await a.receiver.staging.loadReceipt(transfers.get(id)!)).toEqual(originalReceipts.get(id));
    expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id=?').pluck().get(id)).toBe(1);
  }
  for (const id of rejected) {
    expect(a.receiver.sqlite.prepare('SELECT id FROM nodes WHERE id=?').get(id)).toBeUndefined();
    expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id=?').pluck().get(id)).toBe(0);
  }
}
