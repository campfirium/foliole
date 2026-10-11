// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { REQUEST_SYNC_BATCH_BYTES } from '../../lib/core/sync/requestSyncBatchContract.js';
import { withRequestSyncBatchSnapshot } from '../../lib/core/sync/requestSyncBatchSnapshot.js';

import { batchFixture, batchRecord, batchSelections } from './requestSyncBatch.testSupport.js';

const fixtures: Awaited<ReturnType<typeof batchFixture>>[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });
async function source() { const fixture = await batchFixture(); fixtures.push(fixture); return fixture; }

it('prepares 128 small objects in one snapshot and releases it before consumption', async () => {
  const fixture = await source();
  const selections = await batchSelections(fixture, Array.from({ length: 128 }, (_, i) => batchRecord(`node-${i}`, 'small')));
  await withRequestSyncBatchSnapshot(fixture.host, selections, undefined, async objects => {
    expect(objects).toHaveLength(128);
    expect(objects.every(object => object.kind === 'object')).toBe(true);
    expect(fixture.snapshotActive).toBe(false);
    expect(fixture.snapshots).toBe(1);
  });
  await expect(withRequestSyncBatchSnapshot(fixture.host, [...selections, selections[0]!], undefined, async () => {}))
    .rejects.toThrow('request_sync_batch_size_invalid');
});

it('cuts a complete prefix using actual fact and body bytes rather than object count', async () => {
  const fixture = await source();
  const selections = await batchSelections(fixture, [batchRecord('first', 'a'.repeat(600_000)), batchRecord('second', 'b'.repeat(600_000))]);
  await withRequestSyncBatchSnapshot(fixture.host, selections, undefined, async objects => {
    expect(objects).toHaveLength(1);
    const first = objects[0];
    if (first?.kind !== 'object') throw new Error('test_object_missing');
    expect(first.header.globalId).toBe('first');
    expect(first.files.byteLength).toBeGreaterThan(600_000);
    expect(first.files.byteLength).toBeLessThan(REQUEST_SYNC_BATCH_BYTES);
  });
  await withRequestSyncBatchSnapshot(fixture.host, selections.slice(1), undefined, async objects => {
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ kind: 'object', header: { globalId: 'second' } });
  });
});

it('sends an oversized object alone without rejecting or splitting its transaction', async () => {
  const fixture = await source();
  const selections = await batchSelections(fixture, [batchRecord('large', 'x'.repeat(REQUEST_SYNC_BATCH_BYTES)), batchRecord('small', 'small')]);
  await withRequestSyncBatchSnapshot(fixture.host, selections, undefined, async objects => {
    expect(objects[0]).toMatchObject({ kind: 'object' });
    expect(objects).toHaveLength(1);
    const object = objects[0];
    if (object?.kind !== 'object') throw new Error('test_object_missing');
    expect(object.header.globalId).toBe('large');
    expect(object.files.byteLength).toBeGreaterThan(REQUEST_SYNC_BATCH_BYTES);
  });
});

it('isolates preparation errors and still prepares the next object', async () => {
  const fixture = await source();
  const selections = await batchSelections(fixture, [batchRecord('bad', 'bad'), batchRecord('good', 'good')]);
  selections[0]!.resolve = async () => { throw new Error('framed_sync_source_changed'); };
  await withRequestSyncBatchSnapshot(fixture.host, selections, undefined, async objects => {
    expect(objects).toMatchObject([{ kind: 'error', result: { globalId: 'bad', error: 'framed_sync_source_changed' } },
      { kind: 'object', header: { globalId: 'good' } }]);
  });
});
