// @vitest-environment node
import http from 'node:http';

import { expect, it } from 'vitest';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { desktopFramedSyncPreparedBatchItem } from './desktopFramedSyncPreparedBatchItem.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { sendDesktopFramedSyncPublishedBatch } from './desktopFramedSyncPublishedBatch.js';
import { sendDesktopFramedSyncRoundBatch } from './desktopFramedSyncRoundBatch.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

it.each([[false, false], [true, false], [false, true]])(
  'delivers independent objects: omitted receipt=%s, async source=%s', async (omitLast, asyncSource) => {
  const a = await verifiedReceiverFixture('First完整正文', 'first');
  const b = await verifiedReceiverFixture('Second😀正文', 'second', a.sender);
  let requests = 0;
  let replied = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    void handleCompanionLanFramedSyncPost({ request, response,
      authenticate: () => ({ ok: true, device_id: 'sender', device_name: 'Sender', group_id: 'group' }),
      localIdentity: { deviceId: 'receiver', libraryEpoch: 'receiver-epoch' },
      onStream: async ({ stream }) => {
        const reply = await receiveDesktopFramedSyncTransfer({ stream, context: a.context,
          db: a.receiver.db, staging: a.receiver.staging, groupKey: a.groupKey });
        replied += 1;
        return omitLast && replied === 2 ? { ...reply, encodedBytes: (async function* () { yield* []; })() } : reply;
      } });
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
    const input = { db: a.sender.db, staging: a.staging,
      groupSecret: Buffer.from(a.groupKey).toString('base64url'), peerOrigin: `http://127.0.0.1:${address.port}` };
    let sourceReads = 0;
    const publications = (async function* () {
      sourceReads += 1;
      yield a.publication;
      yield b.publication;
    })();
    const sending = asyncSource ? sendDesktopFramedSyncRoundBatch(input, publications)
      : sendDesktopFramedSyncPublishedBatch({ ...input, items: await preparedItems(a, b) });
    if (omitLast) await expect(sending).rejects.toThrow('framed_sync_batch_receipt_missing');
    else await sending;
    if (asyncSource) {
      expect(sourceReads).toBe(1);
      expect(await sending).toEqual([{ state: 'committed' }, { state: 'committed' }]);
    }
    expect(requests).toBe(1);
    expect(a.receiver.sqlite.prepare('SELECT id, content FROM nodes WHERE id IN (?, ?) ORDER BY id').all('first', 'second'))
      .toEqual([{ id: 'first', content: 'First完整正文' }, { id: 'second', content: 'Second😀正文' }]);
    expect(await a.staging.loadReceipt(a.publication.transferId)).not.toBeNull();
    expect(Boolean(await a.staging.loadReceipt(b.publication.transferId))).toBe(!omitLast);
    if (omitLast) expect(await a.staging.loadOutboundPublication(b.publication.transferId)).not.toBeNull();

  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    a.close(); b.close();
  }
});

async function preparedItems(a: Awaited<ReturnType<typeof verifiedReceiverFixture>>,
  b: Awaited<ReturnType<typeof verifiedReceiverFixture>>) {
  const sources = [{ ...a.publication }, { ...b.publication }];
  const deliveries = [
    { body: await loadDesktopFramedSyncPreparedTransferBody(a), attempt: a.attempt },
    { body: await loadDesktopFramedSyncPreparedTransferBody(b), attempt: b.attempt }
  ];
  return sources.map((publication, index) => {
    const item = desktopFramedSyncPreparedBatchItem(publication, deliveries[index]!);
    expect(item).not.toHaveProperty('manifest');
    expect(item).not.toHaveProperty('publication');
    expect(item.published).not.toHaveProperty('manifest');
    Object.defineProperty(publication, 'manifest', {
      get() { throw new Error('prepared_manifest_must_not_be_read'); }
    });
    return item;
  });
}
