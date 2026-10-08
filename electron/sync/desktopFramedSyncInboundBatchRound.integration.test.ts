// @vitest-environment node
import http from 'node:http';

import { expect, it } from 'vitest';

import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { createDesktopFramedSyncInboundBatchDelivery } from './desktopFramedSyncInboundBatchRound.js';
import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { receiveDesktopFramedSyncReceipt } from './desktopFramedSyncReceiptReceiver.js';
import { readDesktopFramedSyncRoundInventory } from './desktopFramedSyncRoundInventory.js';
import { spoolDesktopFramedSyncSequence } from './desktopFramedSyncSequenceSpool.js';
import type { FramedSyncWritableBody } from './desktopFramedSyncStream.js';
import { receiverBusinessRows, verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

type Fixture = Awaited<ReturnType<typeof verifiedReceiverFixture>>;
const context = { groupId: 'group', protocolVersion: 22 as const,
  initiatorDeviceId: 'receiver', initiatorLibraryEpoch: 'receiver-epoch',
  responderDeviceId: 'sender', responderLibraryEpoch: 'sender-epoch' };

async function withServer(a: Fixture, operation: (endpointUrl: string, counts: { data: number; receipts: number }) => Promise<void>,
  override?: () => Promise<FramedSyncWritableBody>) {
  const counts = { data: 0, receipts: 0 };
  const server = http.createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({ request, response,
      authenticate: () => ({ ok: true, device_id: 'receiver', device_name: 'Receiver', group_id: 'group' }),
      localIdentity: { deviceId: 'sender', libraryEpoch: 'sender-epoch' },
      onStream: async ({ stream, context: authenticatedContext }) => {
        const preamble = decodeFramedSyncPreamble(stream.preamble);
        if (preamble.contextKind === 'transfer') {
          counts.receipts += 1;
          return receiveDesktopFramedSyncReceipt({ stream, context: { ...a.context,
            senderDeviceId: 'receiver', senderLibraryEpoch: 'receiver-epoch',
            receiverDeviceId: 'sender', receiverLibraryEpoch: 'sender-epoch' },
            db: a.sender.db, staging: a.staging, groupKey: a.groupKey, transferId: preamble.contextId });
        }
        counts.data += 1;
        if (override) {
          for await (const frame of stream.frames) void frame;
          return override();
        }
        return respondDesktopFramedSyncInventory({ context: authenticatedContext, stream,
          db: a.sender.db, staging: a.staging, groupKey: a.groupKey,
          groupSecret: Buffer.from(a.groupKey).toString('base64url'),
          noncePort: createDesktopFramedSyncSessionNoncePort(a.sender.db) });
      } });
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
    await operation(`http://127.0.0.1:${address.port}`, counts);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function delivery(a: Fixture, endpointUrl: string) {
  const differences = compareFramedSyncInventories({ local: [], remote: await readDesktopFramedSyncRoundInventory(a.sender.db) });
  const deliver = createDesktopFramedSyncInboundBatchDelivery(differences, {
    context, endpointUrl, db: a.receiver.db, staging: a.receiver.staging, groupKey: a.groupKey,
    groupSecret: Buffer.from(a.groupKey).toString('base64url'), roundId: new Uint8Array(16).fill(7),
    noncePort: createDesktopFramedSyncSessionNoncePort(a.receiver.db) });
  return { differences, deliver };
}

it.each([true, false])('recovers the actual missing-parent unit after a committed prefix=%s', async prefix => {
  const rootId = prefix ? 'aaa-root' : 'zzz-root';
  const a = await verifiedReceiverFixture('Root body', rootId);
  try {
    for (const [id, parentId] of [['yyy-parent', null], ['middle-child', 'yyy-parent']] as const) {
      const record = textBranch(`version-${id}`, `${id} body`);
      record.object_id = id; record.snapshot.id = id; record.snapshot.parent_id = parentId;
      await a.sender.receive([record]);
    }
    await withServer(a, async (endpointUrl, counts) => {
      const { differences, deliver } = await delivery(a, endpointUrl);
      const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences,
        async difference => (await deliver(difference)).state);
      expect(deferred).toEqual([]);
      expect(counts).toEqual({ data: prefix ? 4 : 3, receipts: 3 });
      const before = { ...counts };
      for (const difference of differences) expect(await deliver(difference)).toEqual({ sent: true, state: 'delivered' });
      expect(counts).toEqual(before);
      expect(a.sender.sqlite.prepare("SELECT count(*) FROM framed_sync_outbound_publications WHERE state='receipt_committed'").pluck().get()).toBe(3);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(3);
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT id, parent_id, content FROM nodes ORDER BY id').all())
        .toEqual([
          { id: rootId, parent_id: null, content: 'Root body' },
          { id: 'middle-child', parent_id: 'yyy-parent', content: 'middle-child body' },
          { id: 'yyy-parent', parent_id: null, content: 'yyy-parent body' }
        ].sort((left, right) => left.id.localeCompare(right.id)));
      for (const difference of differences) {
        expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id=?').pluck().get(difference.globalId)).toBe(1);
      }
    });
  } finally { a.close(); }
});

it.each([false, true])('commits each returned prefix independently and retries the suffix: large first=%s', async large => {
  const a = await verifiedReceiverFixture(large ? 'x'.repeat(1024 * 1024) : 'First完整正文', 'first');
  const b = await verifiedReceiverFixture('Second😀正文', 'second', a.sender);
  try {
    await withServer(a, async (endpointUrl, counts) => {
      const { differences, deliver } = await delivery(a, endpointUrl);
      expect(await deliver(differences[0]!)).toEqual({ sent: true, state: 'delivered' });
      expect(a.receiver.sqlite.prepare('SELECT id FROM nodes ORDER BY id').all())
        .toEqual(large ? [{ id: 'first' }] : [{ id: 'first' }, { id: 'second' }]);
      expect(await deliver(differences[1]!)).toEqual({ sent: true, state: 'delivered' });
      expect(counts).toEqual({ data: large ? 2 : 1, receipts: 2 });
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all())
        .toEqual([{ id: 'first', content: large ? 'x'.repeat(1024 * 1024) : 'First完整正文' },
          { id: 'second', content: 'Second😀正文' }]);
      expect(a.sender.sqlite.prepare("SELECT count(*) FROM framed_sync_outbound_publications WHERE state = 'receipt_committed'").pluck().get()).toBe(2);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
    });
  } finally { b.close(); a.close(); }
});

it('rejects an authenticated response for another requested object before changing receiver state', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  const b = await verifiedReceiverFixture('Second', 'second', a.sender);
  try {
    const before = receiverBusinessRows(a);
    await withServer(a, async endpointUrl => {
      const { differences, deliver } = await delivery(a, endpointUrl);
      await expect(deliver(differences[0]!)).rejects.toThrow('framed_sync_requested_fact_set_mismatch');
      expect(receiverBusinessRows(a)).toEqual(before);
    }, () => loadDesktopFramedSyncPreparedTransferBody(b));
  } finally { b.close(); a.close(); }
});

it('keeps a committed prefix and its receipt when the later transfer is truncated', async () => {
  const a = await verifiedReceiverFixture('First', 'first');
  const b = await verifiedReceiverFixture('Second', 'second', a.sender);
  let attempts = 0;
  try {
    await withServer(a, async (endpointUrl, counts) => {
      const { differences, deliver } = await delivery(a, endpointUrl);
      await expect(deliver(differences[0]!)).rejects.toThrow('framed_sync_frame_body_truncated');
      expect(a.receiver.sqlite.prepare('SELECT id FROM nodes ORDER BY id').all()).toEqual([{ id: 'first' }]);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
      expect(await deliver(differences[0]!)).toEqual({ sent: true, state: 'delivered' });
      expect(counts.data).toBe(1);
      expect(await deliver(differences[1]!)).toEqual({ sent: true, state: 'delivered' });
      expect(counts).toEqual({ data: 2, receipts: 2 });
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT id FROM nodes ORDER BY id').all()).toEqual([{ id: 'first' }, { id: 'second' }]);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
    }, async () => {
      if (attempts++) return loadDesktopFramedSyncPreparedTransferBody(b);
      const body = await spoolDesktopFramedSyncSequence({ lane: 'payload', bodies: (async function* () {
        yield await loadDesktopFramedSyncPreparedTransferBody(a);
        yield await loadDesktopFramedSyncPreparedTransferBody(b);
      })() });
      return { ...body, encodedBytes: (async function* () {
        let remaining = body.contentLength - 1;
        for await (const chunk of body.encodedBytes!) {
          const count = Math.min(remaining, chunk.byteLength);
          if (count) yield chunk.subarray(0, count);
          remaining -= count;
        }
      })() };
    });
  } finally { b.close(); a.close(); }
});
