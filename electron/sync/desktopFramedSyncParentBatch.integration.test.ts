// @vitest-environment node
import { expect, it } from 'vitest';

import { expectParentBatchDurable, parentBatchHttp, seedParentBatchNode } from './desktopFramedSyncParentBatch.testSupport.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

it('sends two siblings in one data POST when the receiver already has their parent', async () => {
  const a = await verifiedReceiverFixture('parent complete body', 'parent');
  const http = await parentBatchHttp(a);
  try {
    await receiveDesktopFramedSyncTransfer({ stream: await a.stream(), context: a.context,
      db: a.receiver.db, staging: a.receiver.staging, groupKey: a.groupKey });
    await seedParentBatchNode(a, 'child-a', 'parent');
    await seedParentBatchNode(a, 'child-b', 'parent');
    const result = await http.deliver(['child-a', 'child-b']);
    expect(result.deferred).toEqual([]);
    expect(http.state).toEqual({ posts: 1, successful: 1, failed: 0, failures: [] });
    await expectParentBatchDurable(a, result.transfers, ['child-a', 'child-b']);
    expect(a.receiver.sqlite.prepare('SELECT id,parent_id FROM nodes WHERE id LIKE ? ORDER BY id').all('child-%'))
      .toEqual([{ id: 'child-a', parent_id: 'parent' }, { id: 'child-b', parent_id: 'parent' }]);
  } finally { await http.close(); a.close(); }
});

it('sends a parent followed by its child in one data POST to an empty receiver', async () => {
  const a = await verifiedReceiverFixture('a-parent complete body', 'a-parent');
  const http = await parentBatchHttp(a);
  try {
    await seedParentBatchNode(a, 'b-child', 'a-parent');
    const result = await http.deliver(['a-parent', 'b-child']);
    expect(result.deferred).toEqual([]);
    expect(http.state).toEqual({ posts: 1, successful: 1, failed: 0, failures: [] });
    await expectParentBatchDurable(a, result.transfers, ['a-parent', 'b-child']);
  } finally { await http.close(); a.close(); }
});

it('recovers child-before-parent using the original transfer IDs and converges durably', async () => {
  const a = await verifiedReceiverFixture('z-parent complete body', 'z-parent');
  const http = await parentBatchHttp(a);
  try {
    await seedParentBatchNode(a, 'a-child', 'z-parent');
    const result = await http.deliver(['a-child', 'z-parent']);
    expect(result.deferred).toEqual([]);
    expect(http.state.posts).toBe(4);
    expect(http.state.successful).toBe(2);
    expect(http.state.failed).toBe(2);
    expect(http.state.failures).toEqual(Array(2).fill('framed_sync_node_parent_missing:z-parent'));
    expect(new Set(http.receivedTransferIds)).toEqual(new Set(
      [...result.transfers.values()].map(id => Buffer.from(id).toString('hex'))));
    expect(http.receivedTransferIds.filter(id => id === Buffer.from(result.transfers.get('a-child')!).toString('hex'))).toHaveLength(3);
    await expectParentBatchDurable(a, result.transfers, ['a-child', 'z-parent']);
  } finally { await http.close(); a.close(); }
});

it('keeps A committed, attributes the missing parent to B, and completes C with original durable receipts', async () => {
  const a = await verifiedReceiverFixture('a complete body', 'a');
  const http = await parentBatchHttp(a);
  try {
    await seedParentBatchNode(a, 'z-unavailable-parent', null);
    await seedParentBatchNode(a, 'b', 'z-unavailable-parent');
    await seedParentBatchNode(a, 'c', null);
    const result = await http.deliver(['a', 'b', 'c']);
    expect(result.deferred.map(item => item.globalId)).toEqual(['b']);
    expect(http.state.posts).toBe(4);
    expect(http.state.successful).toBe(2);
    expect(http.state.failed).toBe(2);
    expect(http.state.failures).toEqual(Array(2).fill('framed_sync_node_parent_missing:z-unavailable-parent'));
    expect(new Set(http.receivedTransferIds)).toEqual(new Set(
      [...result.transfers.values()].map(id => Buffer.from(id).toString('hex'))));
    expect(http.receivedTransferIds.filter(id => id === Buffer.from(result.transfers.get('a')!).toString('hex'))).toHaveLength(2);
    expect(http.receivedTransferIds.filter(id => id === Buffer.from(result.transfers.get('b')!).toString('hex'))).toHaveLength(2);
    await expectParentBatchDurable(a, result.transfers, ['a', 'c'], ['b']);
    expect(a.receiver.sqlite.prepare('SELECT id FROM nodes WHERE id=?').get('z-unavailable-parent')).toBeUndefined();
  } finally { await http.close(); a.close(); }
});
